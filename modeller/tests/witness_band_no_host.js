#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — W-BAND-NO-HOST, prompts/DISC_WALK_BAND_NO_HOST.md §6, §10, §10.1, §10.2. Read the log after every run; exit code is not evidence.
// ISSUES IT EXPOSES: (1) a walk reported floating devices as placed, so a reader could not tell them from bound ones. (2) The host search measured reach to a ceiling's centre and snapped devices to it,
// so real devices were refused under their own ceiling and stacked on one spot. Is every band device now accounted for, labelled, and where it was?
// Usage: BEFORE_TREE=<tree with the old walker> node witness_band_no_host.js [--before before.json --after after.json]    (fleet JSONs of fleet_band_table.js give B3 on every walk in the run).
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
const H = require('./walk_node_harness.js');
let pass = 0, fail = 0; const chk = (id, ok, d) => { console.log('§W_BAND ' + id + ' ' + (ok ? 'PASS' : 'FAIL') + ' ' + (d || '')); ok ? pass++ : fail++; };
const arg = n => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const DIR = path.join(process.env.HOME, 'bim-ootb', 'buildings'), DB = process.env.WALK_DB || path.join(DIR, 'Clinic_extracted.db'), NAME = process.env.WALK_NAME || 'Clinic';
const BEFORE = process.env.BEFORE_TREE || path.join(process.env.HOME, 'bim-ootb');
const log = console.log, quiet = f => { const lines = []; console.log = s => lines.push(String(s)); try { return { r: f(), lines }; } finally { console.log = log; } };
const key = p => p.ifc_class + '|' + (+p.x).toFixed(3) + '|' + (+p.y).toFixed(3) + '|' + (+p.z).toFixed(3);
const sum = o => Object.keys(o).reduce((a, k) => a + o[k], 0);
const CEIL = { host_ifc_class: 'IfcCovering', mount: 'BOTTOM', offset_m: 0.005, same_storey: 0 };

// One small DB with hand-placed hosts. Row boxes unless a mesh is given.
function fixture(SQL, hosts) {
  const db = new SQL.Database();
  db.run('CREATE TABLE elements_meta(guid TEXT, ifc_class TEXT, element_name TEXT, storey TEXT); CREATE TABLE element_transforms(guid TEXT, center_x REAL, center_y REAL, center_z REAL, rotation_x REAL, rotation_y REAL, rotation_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL); CREATE TABLE element_instances(guid TEXT, geometry_hash TEXT); CREATE TABLE component_geometries(geometry_hash TEXT, vertices BLOB, faces BLOB);');
  hosts.forEach(h => { db.run('INSERT INTO elements_meta VALUES(?,?,?,?)', [h.g, h.cls || 'IfcCovering', '', h.st || 'L1']); db.run('INSERT INTO element_transforms VALUES(?,?,?,?,0,0,?,?,?,?)', [h.g, h.x, h.y, h.z, h.rot || 0, h.bx, h.by, h.bz]);
    if (h.verts) { db.run('INSERT INTO element_instances VALUES(?,?)', [h.g, 'm' + h.g]); db.run('INSERT INTO component_geometries VALUES(?,?,?)', ['m' + h.g, new Uint8Array(new Float32Array(h.verts).buffer), new Uint8Array(new Int32Array(h.faces || [0, 1, 2]).buffer)]); } });
  return db;
}
const dev = (x, y, z, band) => ({ disc: 'ELEC', ifc_class: 'IfcLightFixture', x, y, z, band, prov: 'placed:band' });
// A flat plate mesh around its own origin, so the true midpoint is the row centre.
const box = (dx, dy, dz) => { const v = []; [-1, 1].forEach(a => [-1, 1].forEach(b => [-1, 1].forEach(c => v.push(a * dx / 2, b * dy / 2, c * dz / 2)))); return v; };

function units(SQL, DW) {
  const bind = (hosts, ps, shim, geo, space) => { const db = fixture(SQL, hosts); const out = quiet(() => DW.hostBind(ps, db, shim || CEIL, geo, space)); db.close(); return out; };
  // F1: the defect itself. 11 m from the centre of a 30 x 30 ceiling, under it: old reach (6 m) refused this.
  let o = bind([{ g: 'C1', x: 0, y: 0, z: 3, bx: 30, by: 30, bz: 0.02 }], [dev(11, 2, 2.5)]);
  chk('F1 device under a big ceiling binds and keeps X,Y (hand: x=11 y=2 z=3-0.01-0.005=2.985)', o.r.bound.length === 1 && o.r.bound[0].x === 11 && o.r.bound[0].y === 2 && Math.abs(o.r.bound[0].z - 2.985) < 1e-9 && o.r.bound[0].host === 'C1', JSON.stringify(o.r.bound[0] && [o.r.bound[0].x, o.r.bound[0].y, o.r.bound[0].z]));
  // F2: near a ceiling but not under it: 1 m past the edge. Old code bound this by reach.
  o = bind([{ g: 'C1', x: 0, y: 0, z: 3, bx: 2, by: 2, bz: 0.02 }], [dev(2, 0, 2.5)]);
  chk('F2 device 1 m past a ceiling edge finds no host', o.r.bound.length === 0 && o.r.refusedList.length === 1, 'bound=' + o.r.bound.length);
  // F3: the shape test, on the row box: height >= narrower plan side is not a ceiling. Boundary case on purpose. A small ceiling stays a host: no size threshold.
  o = bind([{ g: 'W', x: 0, y: 0, z: 3, bx: 0.2, by: 5, bz: 3 }], [dev(0, 0, 2.5)]);
  chk('F3a wall layer stored as a covering is rejected', o.r.noHost === true && o.r.shapeRejected === 1 && /shapeRejected=1/.test(o.lines.join()), 'shapeRejected=' + o.r.shapeRejected);
  o = bind([{ g: 'E', x: 0, y: 0, z: 3, bx: 2, by: 3, bz: 2 }], [dev(0, 0, 2.5)]);
  chk('F3b height equal to narrower side is rejected (flatness < 1, strict)', o.r.shapeRejected === 1, 'shapeRejected=' + o.r.shapeRejected);
  o = bind([{ g: 'S', x: 0, y: 0, z: 3, bx: 0.3, by: 0.3, bz: 0.02 }], [dev(0, 0, 2.5)]);
  chk('F3c a small ceiling is still a host', o.r.bound.length === 1 && o.r.shapeRejected === 0, 'bound=' + o.r.bound.length);
  // F4: stacked ceilings. Band picks the one at the device's height; no band takes the nearest face.
  const stack2 = [{ g: 'LOW', x: 0, y: 0, z: 3, bx: 10, by: 10, bz: 0.02 }, { g: 'HIGH', x: 0, y: 0, z: 7, bx: 10, by: 10, bz: 0.02 }];
  o = bind(stack2, [dev(1, 1, 2.5, [6, 8])]);
  chk('F4a a band selects the ceiling at its height', o.r.bound[0] && o.r.bound[0].host === 'HIGH', 'host=' + (o.r.bound[0] && o.r.bound[0].host));
  o = bind(stack2, [dev(1, 1, 6.5)]);
  chk('F4b no band: nearest face in height, and counted as ambiguous', o.r.bound[0] && o.r.bound[0].host === 'HIGH' && o.r.multiCandidate === 1, 'host=' + (o.r.bound[0] && o.r.bound[0].host) + ' multi=' + o.r.multiCandidate);
  o = bind(stack2, [dev(1, 1, 2.5, [20, 21])]);
  chk('F4c a band that meets no ceiling finds no host', o.r.bound.length === 0, 'bound=' + o.r.bound.length);
  // F5: a window is a point host, and keeps today's branch: centre snap, within reach.
  o = bind([{ g: 'W1', cls: 'IfcWindow', x: 5, y: 5, z: 1.5, bx: 1, by: 0.2, bz: 1.2 }], [dev(6, 5, 1.5)], { host_ifc_class: 'IfcWindow', mount: 'TOP', offset_m: 0, same_storey: 0 });
  chk('F5 a window stays a point host: device takes its centre', o.r.bound[0] && o.r.bound[0].x === 5 && o.r.bound[0].y === 5, JSON.stringify(o.r.bound[0] && [o.r.bound[0].x, o.r.bound[0].y]));
  // F6 §10.2: a ceiling centred outside the room holds a device inside the room. Point hosts keep the centre filter.
  const room = { x0: 0, x1: 4, y0: 0, y1: 4 };
  o = bind([{ g: 'BIG', x: 20, y: 2, z: 3, bx: 60, by: 20, bz: 0.02 }], [dev(2, 2, 2.5)], CEIL, null, room);
  chk('F6a ceiling centred outside the room binds a device inside it, position unchanged', o.r.bound.length === 1 && o.r.bound[0].x === 2 && o.r.bound[0].y === 2, 'bound=' + o.r.bound.length);
  o = bind([{ g: 'W1', cls: 'IfcWindow', x: 20, y: 2, z: 1.5, bx: 1, by: 0.2, bz: 1.2 }], [dev(2, 2, 1.5)], { host_ifc_class: 'IfcWindow', mount: 'TOP', offset_m: 0, same_storey: 0 }, null, room);
  chk('F6b a point host centred outside the room stays filtered out', o.r.noHost === true, 'noHost=' + o.r.noHost);
  // F7 §10.2: the box the test reads. A mesh, when at hand, wins over a wrong stored row, and the log says which source each host took.
  o = bind([{ g: 'M', x: 0, y: 0, z: 3, bx: 0.2, by: 0.2, bz: 5, verts: box(8, 8, 0.02), faces: [1, 3, 7, 1, 7, 5] }], [dev(3, 3, 2.5)]);
  chk('F7a a mesh box wins over the stored row, and the source is logged', o.r.bound.length === 1 && /boxFromMesh=1 boxFromRow=0/.test(o.lines.join()), (o.lines.find(l => /§WALK-AREAHOST/.test(l)) || '').slice(0, 110));
  // F7b §10.3: an upright plate that passes the box test because its world box is wide (the fascia case): the mesh reader rejects it, and names it. F7c: red control, a flat mesh in the same box stays a host.
  const up = [0, -6, -1, 0, 6, -1, 0, 6, 1, 0, -6, 1], c45 = Math.SQRT1_2, rot = []; for (let i = 0; i < up.length; i += 3) rot.push(up[i] * c45 - up[i + 1] * c45, up[i] * c45 + up[i + 1] * c45, up[i + 2]);
  o = bind([{ g: 'F', x: 0, y: 0, z: 3, bx: 8.49, by: 8.49, bz: 2, verts: rot, faces: [0, 1, 2, 0, 2, 3] }], [dev(1, 1, 2)]);
  chk('F7b a diagonal upright host passes the box test and is rejected by the mesh, named in the log', o.r.bound.length === 0 && /shapeRejected=0/.test(o.lines.join()) && /uprightRejected=1/.test(o.lines.join()) && /upright=\[F hz=/.test(o.lines.join()), (o.lines.find(l => /§WALK-AREAHOST/.test(l)) || '').replace(/.*hostsUsed/, 'hostsUsed'));
  const flatP = [-4, -4, 0, 4, -4, 0, 4, 4, 0, -4, 4, 0];
  o = bind([{ g: 'P', x: 0, y: 0, z: 3, bx: 8, by: 8, bz: 0.02, verts: flatP, faces: [0, 1, 2, 0, 2, 3] }], [dev(1, 1, 2)]);
  chk('F7c RED: a flat mesh is kept, so F7b is the mesh and not the box', o.r.bound.length === 1 && /uprightRejected=0/.test(o.lines.join()), 'bound=' + o.r.bound.length);
  // F7d: no faces at hand: the mesh test does not judge, the box test stands, and the log counts it.
  o = bind([{ g: 'R', x: 0, y: 0, z: 3, bx: 8, by: 8, bz: 0.02 }], [dev(1, 1, 2)]);
  chk('F7d no mesh: not judged by the normal test, still bound, counted', o.r.bound.length === 1 && /noNormals=1/.test(o.lines.join()), 'bound=' + o.r.bound.length);
}

// Every band device must be counted once, and what is in the output must match its count.
function balance(w, input) {
  const bad = [], a = w.refusedNoHost; if (!a) return ['no accounting'];
  Object.keys(input).forEach(c => { const r = a.byClass[c] || {}, tot = (r.bound || 0) + (r.unhosted || 0) + (r.notJudged || 0) + (r.refused || 0), out = (w.placements || []).filter(p => p.ifc_class === c && /^(placed:|shim:host)/.test(p.prov || '')).length; if (tot !== input[c] || (r.bound || 0) + (r.unhosted || 0) + (r.notJudged || 0) !== out) bad.push(c + ':input=' + input[c] + ' count=' + tot + ' out=' + out); });
  return bad;
}
// The check B5 states, as a function so its red control runs the same code.
const misread = w => (w.placements || []).filter(p => (p.hostState === 'bound' && (!p.host || !/^shim:host/.test(p.prov || ''))) || (/^placed:/.test(p.prov || '') && p.host) || (/^placed:/.test(p.prov || '') && p.hostState !== 'unhosted' && p.hostState !== 'not_judged'));

// B8: real devices at their real positions, through hostBind, against the old walker's hostBind.
function oracle(SQL, DW, OLD) {
  const SETS = [['Clinic', 'Clinic_extracted.db'], ['Duplex', 'Duplex_extracted.db'], ['HHS', 'HHS_Office_Federated_extracted.db'], ['Hospital', 'Hospital_extracted.db'], ['JKR', 'JKR_extracted.db'], ['Terminal', 'Terminal_meta.db', 'Terminal_geo.db']];
  // The classes the rule rows themselves send to a ceiling (`fixture_ifc_class` with IfcCovering, terminal_rules.db). A plain IfcFlowTerminal also holds receptacles, switches, sconces and floor traps, and a residential row sends it to a wall: its counts are printed, not judged.
  const CLS = ['IfcLightFixture', 'IfcAirTerminal', 'IfcFireSuppressionTerminal'];
  let judged = 0, moved = 0, stackedNew = 0, stackedOld = 0, worse = [], tb = 0, to = 0;
  SETS.forEach(([name, f, g]) => {
    const p = path.join(DIR, f); if (!fs.existsSync(p) || fs.statSync(p).size < 10240) { log('§W_BAND B8 ' + name + ' UNRUN db absent'); return; }
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(p))), geo = g ? new SQL.Database(new Uint8Array(fs.readFileSync(path.join(DIR, g)))) : null;
    const read = list => { const rs = db.exec("SELECT m.ifc_class, t.center_x, t.center_y, t.center_z, m.storey FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class IN (" + list.map(c => "'" + c + "'").join() + ")")[0]; return rs ? rs.values.map(v => ({ disc: 'X', ifc_class: v[0], x: v[1], y: v[2], z: v[3], storey: v[4], prov: 'placed:real' })) : []; };
    const devs = read(CLS), ft = read(['IfcFlowTerminal']);
    if (ft.length) { const fn = quiet(() => DW.hostBind(ft.map(d => Object.assign({}, d)), db, CEIL, geo)).r, fo = quiet(() => OLD.hostBind(ft.map(d => Object.assign({}, d)), db, CEIL, geo)).r; log('§W_BAND B8 ' + name + ' IfcFlowTerminal, not judged: devices=' + ft.length + ' new bound=' + (fn.bound || []).length + ' old bound=' + (fo.bound || []).length); }
    if (!devs.length) { log('§W_BAND B8 ' + name + ' UNRUN no real devices of ' + CLS.join('/')); db.close(); if (geo) geo.close(); return; }
    const n = quiet(() => DW.hostBind(devs.map(d => Object.assign({}, d)), db, CEIL, geo)), o = quiet(() => OLD.hostBind(devs.map(d => Object.assign({}, d)), db, CEIL, geo));
    const orig = {}; devs.forEach(d => { orig[d.x.toFixed(3) + ',' + d.y.toFixed(3)] = 1; });
    const nb = n.r.bound || [], ob = o.r.bound || [], spot = L => new Set(L.map(b => b.x.toFixed(3) + ',' + b.y.toFixed(3))).size;
    const off = nb.filter(b => !orig[b.x.toFixed(3) + ',' + b.y.toFixed(3)]).length;
    // Real devices can share a spot in the source (the IFC holds them so). Stacked = sharing beyond what the input already shares.
    const inN = {}; devs.forEach(d => { const k = d.x.toFixed(3) + ',' + d.y.toFixed(3); inN[k] = (inN[k] || 0) + 1; }); const over = L => { const m = {}; L.forEach(b => { const k = b.x.toFixed(3) + ',' + b.y.toFixed(3); m[k] = (m[k] || 0) + 1; }); return Object.keys(m).reduce((a, k) => a + Math.max(0, m[k] - (inN[k] || 1)), 0); };
    judged += nb.length; moved += off; tb += nb.length; to += ob.length; stackedNew += over(nb); stackedOld += over(ob); if (nb.length < ob.length) worse.push(name + ' ' + nb.length + '<' + ob.length);
    const hl = n.lines.find(l => /§WALK-AREAHOST/.test(l)) || '';
    log('§W_BAND B8 ' + name + ' devices=' + devs.length + ' distinctInput=' + Object.keys(orig).length + ' | new bound=' + nb.length + ' spots=' + spot(nb) + ' movedXY=' + off + ' | old bound=' + ob.length + ' spots=' + spot(ob) + ' | ' + hl.replace(/.*hosts=/, 'hosts='));
    db.close(); if (geo) geo.close();
  });
  if (!judged) { log('§W_BAND B8 INCONCLUSIVE no real device judged'); return; }
  chk('B8a every bound device keeps X,Y to 1e-3 m', moved === 0, 'bound=' + judged + ' moved=' + moved);
  chk('B8b no two devices share a spot they did not already share in the source', stackedNew === 0, 'newStacked=' + stackedNew + ' oldStacked=' + stackedOld);
  chk('B8c bound count at least today\'s, per building', !worse.length, 'new=' + tb + ' old=' + to + ' ' + worse.join(' ; '));
  chk('B8 RED: the old centre snap fails B8b', stackedOld > stackedNew, 'oldStacked=' + stackedOld + ' newStacked=' + stackedNew);
}

(async () => {
  if (!fs.existsSync(DB)) { log('§W_BAND VERDICT INCONCLUSIVE db absent'); process.exit(0); }
  const SQL = await initSqlJs(), stack = await H.loadStack(SQL), raw = fs.readFileSync(DB), DW = stack.DW;
  const oldFile = path.join(BEFORE, 'modeller', 'disc_walker.js'); let OLD = null;
  if (fs.existsSync(oldFile) && fs.realpathSync(oldFile) !== fs.realpathSync(path.join(__dirname, '..', 'disc_walker.js'))) OLD = require(oldFile);
  log('§W_BAND trees new=' + path.join(__dirname, '..') + ' before=' + (OLD ? BEFORE : 'none, B4 and B8 unrun'));
  units(SQL, DW);
  H.openBuildingRules(SQL, stack, NAME);
  const walkOf = st => (disc, extra) => quiet(() => H.walkLive(SQL, st, disc, new Uint8Array(raw), NAME, [], extra)).r;
  const walk = walkOf(stack), DISC = 'ELEC', real = walk(DISC, {}), raw0 = walk(DISC, { noHostBind: true });
  if (!raw0.placed) { log('§W_BAND VERDICT INCONCLUSIVE the raw walk placed nothing on this building, nothing judged'); process.exit(0); }
  const input = {}; raw0.placements.filter(p => /^placed:/.test(p.prov || '')).forEach(p => input[p.ifc_class] = (input[p.ifc_class] || 0) + 1);
  const A = real.refusedNoHost; log('§W_BAND run ' + NAME + '/' + DISC + ' mode=' + (real.mode || 'legacy') + ' rawInput=' + sum(input) + ' placed=' + real.placed + ' bound=' + A.bound + ' unhosted=' + A.unhosted + ' notJudged=' + A.notJudged + ' refused=' + A.refused);
  // B2: each outcome fires, forced by the caller-shim seam, so the code path is the shipped one.
  const lab = (w, s) => (w.placements || []).filter(p => p.hostState === s).length, row = o => Object.assign({ disc: DISC, fixture_ifc_class: null, priority: 1, product_value: DISC + '_T' }, o);
  const noRule = walk(DISC, { shims: [] }), noCeil = walk(DISC, { shims: [row({ host_ifc_class: 'IfcCovering', mount: 'BOTTOM', same_storey: 1 })] }), wallFar = walk(DISC, { shims: [row({ host_ifc_class: 'IfcWall', mount: 'SIDE', reach_m: 0.0001 })] }), absent = walk(DISC, { shims: [row({ host_ifc_class: 'IfcNoSuchClass', mount: 'BOTTOM' })] }), slabRow = walk(DISC, { shims: [row({ host_ifc_class: 'IfcSlab', mount: 'TOP', same_storey: 1 })] });
  chk('B2a no host rule: not judged, present, labelled, not refused', noRule.refusedNoHost.notJudged > 0 && lab(noRule, 'not_judged') === noRule.refusedNoHost.notJudged && !noRule.refusedNoHost.refused, 'notJudged=' + noRule.refusedNoHost.notJudged + ' labelled=' + lab(noRule, 'not_judged'));
  chk('B2b ceiling row, no ceiling at the spot: unhosted, present, labelled, not refused', noCeil.refusedNoHost.unhosted > 0 && lab(noCeil, 'unhosted') === noCeil.refusedNoHost.unhosted && !noCeil.refusedNoHost.refused, 'unhosted=' + noCeil.refusedNoHost.unhosted + ' labelled=' + lab(noCeil, 'unhosted') + ' bound=' + noCeil.refusedNoHost.bound);
  chk('B2c wall row out of reach: refused, gone, never labelled unhosted', wallFar.refusedNoHost.refused > 0 && !lab(wallFar, 'unhosted') && !(wallFar.placements || []).some(p => /^placed:/.test(p.prov || '')), 'refused=' + wallFar.refusedNoHost.refused + ' reason=' + (wallFar.reason || '-').slice(0, 60));
  chk('B2d host class absent on a non-ceiling row: refused, gone', absent.refusedNoHost.refused > 0 && !(absent.placements || []).some(p => /^placed:/.test(p.prov || '')), 'refused=' + absent.refusedNoHost.refused);
  const slabGone = (slabRow.placements || []).filter(p => /^placed:/.test(p.prov || '')).length;
  chk('B2e slab row with no slab at the spot: refused, not unhosted', !lab(slabRow, 'unhosted') && !slabGone, 'bound=' + slabRow.refusedNoHost.bound + ' refused=' + slabRow.refusedNoHost.refused + ' floating=' + slabGone);
  // B1: a host at every device's spot: bound, nothing else. A huge reach on a wall row.
  const wide = walk(DISC, { shims: [row({ host_ifc_class: 'IfcWall', mount: 'SIDE', reach_m: 1e6, same_storey: 0 })] }), wA = wide.refusedNoHost;
  chk('B1 hosts in reach: all bound, none unhosted or refused', wA.bound > 0 && !wA.refused && !wA.unhosted && !wA.notJudged, 'bound=' + wA.bound + ' refused=' + wA.refused);
  [['real', real], ['noRule', noRule], ['noCeil', noCeil], ['wallFar', wallFar]].forEach(([n, w]) => { const bad = balance(w, input); chk('B3 ' + n + ': input = bound + unhosted + not judged + refused, per class, output matches', !bad.length, 'classes=' + Object.keys(input).length + ' input=' + sum(input) + ' ' + bad.join(' ')); });
  chk('B5 no band device reads as bound without a host', misread(real).length === 0, 'misread=' + misread(real).length + ' of ' + (real.placements || []).length);
  const forged = { placements: (real.placements || []).map(p => Object.assign({}, p)) }, f0 = forged.placements.find(p => p.hostState === 'unhosted') || forged.placements[0]; f0.hostState = 'bound'; f0.host = null;
  chk('B5 RED: a forged bound label with no host fails that check', misread(forged).length > 0, 'misread=' + misread(forged).length);
  const kept = walk(DISC, { shims: wallFar.refusedNoHost ? [row({ host_ifc_class: 'IfcWall', mount: 'SIDE', reach_m: 0.0001 })] : [], keepUnhosted: true });
  chk('B5b RED: keepUnhosted puts refused devices back, so the refusal above is what removed them', (kept.placements || []).filter(p => /^placed:/.test(p.prov || '')).length > 0, 'floating=' + (kept.placements || []).filter(p => /^placed:/.test(p.prov || '')).length);
  // B4: what §10 does not touch stays put: wall-bound, point-host and schedule devices, against the old walker's own run of this same DB.
  if (OLD) {
    const stOld = { DW: OLD, WalkRules: stack.WalkRules }; quiet(() => H.openBuildingRules(SQL, stOld, NAME)); const before = walkOf(stOld)(DISC, {}), after = real;
    const untouched = w => { const m = {}; (w.placements || []).filter(p => !/^placed:/.test(p.prov || '') && !/IfcCovering|IfcSlab|IfcRoof/.test(p.prov || '')).forEach(p => { const k = key(p); m[k] = (m[k] || 0) + 1; }); return m; };
    const mb = untouched(before), ma = untouched(after), diff = [...new Set(Object.keys(mb).concat(Object.keys(ma)))].filter(k => mb[k] !== ma[k]);
    chk('B4 wall-bound, point-host and schedule devices identical to the old walker, to 1e-3 m', !diff.length && sum(ma) > 0, 'old=' + sum(mb) + ' new=' + sum(ma) + ' differing=' + diff.length);
    oracle(SQL, DW, OLD);
    quiet(() => H.openBuildingRules(SQL, stack, NAME));
  } else log('§W_BAND B4 UNRUN no old walker · B8 UNRUN no old walker');
  // B6: a walk with no band devices says VACUOUS. A schedule walk on the public residential building.
  const dupF = path.join(DIR, 'Duplex_extracted.db');
  if (fs.existsSync(dupF)) {
    const dup = fs.readFileSync(dupF); quiet(() => H.openBuildingRules(SQL, stack, 'Duplex')); const q = quiet(() => H.walkLive(SQL, stack, 'ACMV', new Uint8Array(dup), 'Duplex', [], {})), line = q.lines.find(l => /§WALK-BAND-NOHOST/.test(l)) || '';
    chk('B6 a walk with no band devices prints VACUOUS', /input=0 VACUOUS/.test(line) && q.r.mode !== 'measured-band', line.slice(0, 120));
  } else log('§W_BAND B6 INCONCLUSIVE no schedule building at hand');
  // B3 over every walk in the fleet run: raw input against the after row's own four counts.
  const bf = arg('--before'), af = arg('--after');
  if (bf && af) {
    const B = JSON.parse(fs.readFileSync(bf)), R = JSON.parse(fs.readFileSync(af)), idx = {}; B.forEach(r => idx[r.file + '|' + r.disc] = r);
    let judged = 0, off = []; R.forEach(r => { const b = idx[r.file + '|' + r.disc], a = r.refusedNoHost; if (!b || !a || !a.input) return; judged++; const four = a.bound + a.unhosted + a.notJudged + a.refused; if (four !== a.input || r.placed + a.refused !== b.placed) off.push(r.file + '/' + r.disc + ' input=' + a.input + ' four=' + four + ' before placed=' + b.placed + ' after placed=' + r.placed + ' refused=' + a.refused); });   // `bound` by provenance also holds devices already hosted before this pass, so the walk totals are the comparison
    chk('B3 fleet: four counts = input, and before placed = after placed + refused, on every walk that had band devices', judged > 0 && !off.length, 'walks=' + judged + ' off=' + off.length + ' ' + off.slice(0, 6).join(' ; '));
  } else log('§W_BAND B3-fleet INCONCLUSIVE no fleet JSONs named');
  log('§W_BAND VERDICT pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { log('§W_BAND ERROR ' + (e && e.stack || e)); process.exit(1); });
