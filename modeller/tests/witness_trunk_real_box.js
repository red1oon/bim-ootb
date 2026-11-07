#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — W-TRUNK-REAL-BOX, prompts/DISC_WALK_BAND_NO_HOST.md §10.4. Read the log after every run; exit code is not evidence.
// ISSUE IT EXPOSES: the corridor trunk is planned around walls and doors where the ROW says they are, not where the mesh is, so it avoids walls that are not there and can cross ones that are.
// Usage: BEFORE_TREE=<tree with the walker before this fix> node witness_trunk_real_box.js
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
const B = path.join(process.env.HOME, 'bim-ootb', 'buildings'), DEPLOY = path.join(process.env.HOME, 'bim-compiler', 'deploy', 'buildings');
const BEFORE = process.env.BEFORE_TREE;
if (!BEFORE) { console.log('§W_TRUNK VERDICT INCONCLUSIVE no BEFORE_TREE, the red controls cannot run, nothing judged'); process.exit(0); }
const OLD_DW = require(path.join(BEFORE, 'modeller', 'disc_walker.js')), OLD_ST = require(path.join(BEFORE, 'modeller', 'seed_trunk.js'));
const DW = require('../disc_walker.js'), ST = require('../seed_trunk.js');
globalThis.DiscWalker = DW;   // what the page's script tag does; the old router never reads it
let pass = 0, fail = 0; const chk = (id, ok, d) => { console.log('§W_TRUNK ' + id + ' ' + (ok ? 'PASS' : 'CLAIM NOT MET') + ' ' + (d || '')); ok ? pass++ : fail++; };
const log = console.log, quiet = f => { const lines = []; console.log = s => lines.push(String(s)); try { return { r: f(), lines }; } finally { console.log = log; } };
// A box mesh around (ox, oy) in the element's local frame, so its middle sits that far off the row centre.
const mesh = (ox, oy, dx, dy, dz) => { const v = []; [-1, 1].forEach(a => [-1, 1].forEach(b => [-1, 1].forEach(c => v.push(ox + a * dx / 2, oy + b * dy / 2, c * dz / 2)))); return v; };
function fixture(SQL, els) {
  const db = new SQL.Database();
  db.run('CREATE TABLE elements_meta(guid TEXT, ifc_class TEXT, element_name TEXT, storey TEXT); CREATE TABLE element_transforms(guid TEXT, center_x REAL, center_y REAL, center_z REAL, rotation_x REAL, rotation_y REAL, rotation_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL); CREATE TABLE element_instances(guid TEXT, geometry_hash TEXT); CREATE TABLE component_geometries(geometry_hash TEXT, vertices BLOB, faces BLOB);');
  els.forEach(e => { db.run('INSERT INTO elements_meta VALUES(?,?,?,?)', [e.g, e.cls, '', 'L1']); db.run('INSERT INTO element_transforms VALUES(?,?,?,?,0,0,0,?,?,?)', [e.g, e.x, e.y, e.z || 0, e.bx, e.by, e.bz]);
    if (e.verts) { db.run('INSERT INTO element_instances VALUES(?,?)', [e.g, 'm' + e.g]); db.run('INSERT INTO component_geometries VALUES(?,?,?)', ['m' + e.g, new Uint8Array(new Float32Array(e.verts).buffer), new Uint8Array(new Int32Array(e.faces || [0, 1, 2]).buffer)]); } });
  return db;
}
// Seed left of x=0, fixture right of it. A wall across the whole site whose row centre says x=3 and whose mesh says x=0. Markers set the grid's extent.
const site = [{ g: 'A', cls: 'IfcSlab', x: -5, y: -5, bx: 1, by: 1, bz: 0.1 }, { g: 'B', cls: 'IfcSlab', x: 5, y: 5, bx: 1, by: 1, bz: 0.1 }];
const wall = { g: 'W', cls: 'IfcWall', x: 3, y: 0, bx: 0.2, by: 100, bz: 3, verts: mesh(-3, 0, 0.2, 100, 3) };
const seed = { x: -2, y: 0, storey: 'L1' }, fx = [{ x: 2, y: 0, storey: 'L1' }], opt = { storeys: [{ name: 'L1', z: 0 }], groundStorey: 'L1' };
const plan = (S, els) => { const db = fixture(sqlSingleton, els), o = quiet(() => S.planTrunk(db, fx, seed, [], opt)); db.close(); return o; };
let sqlSingleton;
(async () => {
  const SQL = sqlSingleton = await initSqlJs();
  // K1: the wall is where the mesh says. Hand: seed x=-2, fixture x=2, wall true x=0 across the site: unreachable. The old router read x=3 and walked straight there.
  let n = plan(ST, site.concat([wall])), o = plan(OLD_ST, site.concat([wall]));
  chk('K1 a wall blocks where its mesh is: the fixture behind it is refused', n.r.served === 0 && n.r.refused === 1 && /boxFromMesh=1/.test(n.lines.join()), 'served=' + n.r.served + ' refused=' + n.r.refused + ' | ' + (n.lines.find(l => /§TRUNK-BOX/.test(l)) || ''));
  chk('K1 RED: the old router, on the row box, walked through it', o.r.served === 1 && o.r.refused === 0, 'old served=' + o.r.served + ' refused=' + o.r.refused);
  // K2: a door in that wall, row centre 3 m off, mesh on the wall: the passage is at the mesh. Red: the same door with no mesh carves at the row, and the wall stays shut.
  const door = { g: 'D', cls: 'IfcDoor', x: 3, y: 0, bx: 1, by: 0.2, bz: 2, verts: mesh(-3, 0, 1, 0.2, 2) }, noMesh = { g: 'D', cls: 'IfcDoor', x: 3, y: 0, bx: 1, by: 0.2, bz: 2 };
  n = plan(ST, site.concat([wall, door])); o = plan(ST, site.concat([wall, noMesh]));
  chk('K2 a door carves its passage where its mesh is', n.r.served === 1 && n.r.refused === 0, 'served=' + n.r.served);
  chk('K2 RED: with no mesh it carves at the row, away from the wall, and says so', o.r.served === 0 && o.r.refused === 1 && /boxFromRow=1/.test(o.lines.join()), 'served=' + o.r.served + ' | ' + (o.lines.find(l => /§TRUNK-BOX/.test(l)) || ''));
  // K4: the host search takes the same box.
  const ceil = { g: 'C', cls: 'IfcCovering', x: 3, y: 0, bx: 2, by: 2, bz: 0.02, z: 3, verts: mesh(-3, 0, 2, 2, 0.02), faces: [1, 3, 7, 1, 7, 5] }, cdb = fixture(SQL, [ceil]), shim = { host_ifc_class: 'IfcCovering', mount: 'BOTTOM', offset_m: 0.005, same_storey: 0 };
  const bx = DW.realBox(cdb, { g: 'C', x: 3, y: 0, z: 3, bx: 2, by_: 2, bz: 0.02 }), hb = quiet(() => DW.hostBind([{ disc: 'X', ifc_class: 'IfcLightFixture', x: 0, y: 0, z: 2.5, prov: 'placed:band' }, { disc: 'X', ifc_class: 'IfcLightFixture', x: 3, y: 0, z: 2.5, prov: 'placed:band' }], cdb, shim)).r; cdb.close();
  chk('K4 the host search uses that box: holds a device under the mesh, not one under the row', bx.source === 'mesh' && bx.x === 0 && hb.bound.length === 1 && hb.bound[0].x === 0 && hb.refusedList.length === 1, 'box x=' + bx.x + ' source=' + bx.source + ' bound=' + hb.bound.length);
  // K3: real buildings, before and after. A segment crosses a wall when a sample on it falls inside a true wall box, away from any true door.
  let judged = 0, crossOld = 0, crossNew = 0, lostServed = [];
  [['Duplex', path.join(B, 'Duplex_extracted.db')], ['SampleHouse', path.join(DEPLOY, 'SampleHouse_extracted.db')], ['HHS', path.join(B, 'HHS_Office_Federated_extracted.db')], ['Clinic', path.join(B, 'Clinic_extracted.db')], ['JKR', path.join(B, 'JKR_extracted.db')]].forEach(([name, p]) => {
    if (!fs.existsSync(p) || fs.statSync(p).size < 10240) { log('§W_TRUNK K3 ' + name + ' UNRUN db absent'); return; }
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(p))), rows = q => { const r = db.exec(q); return r[0] ? r[0].values.map(v => { const x = {}; r[0].columns.forEach((c, i) => x[c] = v[i]); return x; }) : []; };
    DW.dwOpen(new SQL.Database(new Uint8Array(fs.readFileSync(path.join(__dirname, '..', 'duplex_rules.db')))));
    const fixtures = quiet(() => DW.dwWalk('ELEC', db, name)).r.placements || [], s0 = DW.defaultSeed(db);
    if (!fixtures.length || s0.refused) { log('§W_TRUNK K3 ' + name + ' not judged, no fixtures or no seed'); db.close(); return; }
    const COLS = "m.guid g, m.ifc_class c, t.center_x x, t.center_y y, t.center_z z, t.bbox_x bx, t.bbox_y by_, t.bbox_z bz, t.rotation_x rx, t.rotation_y ry, t.rotation_z rot";
    const els = rows("SELECT " + COLS + " FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class LIKE '%Wall%' OR m.ifc_class LIKE '%Column%' OR m.ifc_class LIKE '%Door%'").map(e => Object.assign({ c: e.c }, DW.realBox(db, e)));
    const walls = els.filter(e => !/Door/.test(e.c)), doors = els.filter(e => /Door/.test(e.c)), meshed = els.filter(e => e.source === 'mesh').length;
    if (!meshed) { log('§W_TRUNK K3 ' + name + ' not judged, no mesh in this file'); db.close(); return; }
    const crossings = net => { let c = 0, segs = 0; (net.storeys || []).forEach(st => (st.edges || []).forEach(poly => { for (let i = 1; i < poly.length; i++) { segs++; const a = poly[i - 1], b = poly[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(len / 0.1)); let hit = false;
      for (let k = 0; k <= n && !hit; k++) { const x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n, z = a[2]; if (doors.some(d => Math.abs(d.z - z) < 3 && Math.hypot(x - d.x, y - d.y) <= 0.6)) continue; hit = walls.some(w => Math.abs(w.z - z) < 1.8 && Math.abs(x - w.x) < w.ex / 2 && Math.abs(y - w.y) < w.ey / 2); } if (hit) c++; } })); return { c, segs }; };
    const risers = []; rows("SELECT m.guid guid, t.center_x x, t.center_y y FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class LIKE '%Stair%'").forEach(r => { if (!risers.some(q => Math.hypot(q.x - r.x, q.y - r.y) < 0.5)) risers.push(r); });
    const seedPt = { x: s0.x, y: s0.y, storey: s0.storey }, opts = { groundStorey: s0.storey };
    const a = quiet(() => OLD_ST.planTrunk(db, fixtures, seedPt, risers, opts)).r, b = quiet(() => ST.planTrunk(db, fixtures, seedPt, risers, opts)), xa = crossings(a), xb = crossings(b.r);
    judged++; crossOld += xa.c; crossNew += xb.c; if (b.r.served < a.served) lostServed.push(name + ' ' + a.served + '->' + b.r.served);
    log('§W_TRUNK K3 ' + name + ' fixtures=' + fixtures.length + ' | before served=' + a.served + ' refused=' + a.refused + ' len=' + (a.totalLen || 0).toFixed(1) + ' crossing=' + xa.c + '/' + xa.segs + ' | after served=' + b.r.served + ' refused=' + b.r.refused + ' len=' + (b.r.totalLen || 0).toFixed(1) + ' crossing=' + xb.c + '/' + xb.segs + ' | ' + (b.lines.find(l => /§TRUNK-BOX/.test(l)) || ''));
    db.close();
  });
  if (!judged) log('§W_TRUNK K3 INCONCLUSIVE no real building judged');
  else {
    chk('K3 the trunk crosses fewer true wall boxes than the old router did', crossNew < crossOld || crossOld === 0, 'old=' + crossOld + ' new=' + crossNew + ' over ' + judged + ' buildings');
    // Reported, not judged: a fixture only reachable through a wall is refused now. The doctrine says refuse what it cannot reach, so a lower served count is not a failure in itself.
    log('§W_TRUNK K3 served fell: ' + (lostServed.join(' ; ') || 'none'));
  }
  log('§W_TRUNK VERDICT pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log = log; log('§W_TRUNK ERROR ' + (e && e.stack || e)); process.exit(1); });
