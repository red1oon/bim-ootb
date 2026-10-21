#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ROOMS (rule D22, prompts/DXF2BIM_FOUNDATION_LANE.md). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the 2D plans out of the Viewer drew no rooms (owner 2026-10-21: room topology comes from the Find panel's Room Injection,
 * not "no IfcSpace, so no rooms"). The rooms here are made by the SAME code the Viewer injects with (viewer/lib/room_walker.js on the Viewer's db), then passed to
 * the writer as the Viewer passes A.allRoomVolumes (rects in model metres).
 *   R1 LABEL    — every room gets exactly one label on the plan of its storey (highest storey elevation <= its mid height), at a point inside one of its own rects.
 *   R2 STATED   — compiled rooms (RM_*) are on A-AREA-IDEN-DFLT (yellow), each plan with rooms states the source (ROOMS: n FROM ...) and carries @LAYER=<room layer>,ignore.
 *   R3 NOT READ — the reader's verdict (refused, blocking count) is the same with and without the room labels: a label is a drawing, never read back.
 *   R4 ONLY PLANS — with rooms, every sheet other than the plans is byte-identical to the set without rooms.
 *   R5 BOX      — on the wand's box set (turn TURN, default 0) only the rooms whose label point lies in the box are drawn, each label (turned back) inside its own rect.
 * Usage: NODE_PATH=<dir with sql.js> node modeller/tests/witness_dxf_rooms.js <Viewer db (room source)> <writer db or _2d.db sidecar of the same building>
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), initSqlJs = require('sql.js');
const M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/', ROOT = path.join(M, '..');
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js'), SC = require(D + 'std2d_scopes.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), P = new DxfParser(), I = require(path.join(M, 'dxf2bim_import.js')), RW = require(path.join(ROOT, 'viewer/lib/room_walker.js'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
(async () => {
  const SQL = await initSqlJs(), vdb = new SQL.Database(new Uint8Array(fs.readFileSync(process.argv[2]))), wdb = new SQL.Database(new Uint8Array(fs.readFileSync(process.argv[3])));
  const q = sql => { const r = wdb.exec(sql); if (!r.length) return []; return r[0].values.map(v => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))); };
  const t0 = Date.now(), w = RW.walk(vdb, { write: true });
  const rr = vdb.exec("SELECT s.guid, s.name, s.center_x, s.center_y, s.center_z, s.size_x, s.size_y, s.size_z, s.room_guid FROM spatial_structure s WHERE s.type='IfcSpace' AND s.center_x IS NOT NULL AND s.size_x IS NOT NULL");
  const rooms = (rr.length ? rr[0].values : []).map(v => ({ guid: v[8] || v[0], name: v[1], cx: v[2], cy: v[3], cz: v[4], sx: v[5], sy: v[6], sz: v[7] }));
  say(`INFO rooms from room_walker on ${path.basename(process.argv[2])}: rects=${rooms.length} rooms=${new Set(rooms.map(r => r.guid)).size} ms=${Date.now() - t0} (written=${w.roomsWritten})`);
  const SRC = 'the Viewer room injection (room_walker)';
  const sheetsOf = (R, kind) => R.views.plan.map(({ view, storey }) => ({ view, storey, name: Object.keys(R.files).find(n => n.endsWith('_' + view + '_std.dxf')) })).filter(x => x.name);
  const labelsOk = (R, inv) => {   // R1 on a set: per room, labels on its storey's plan, inside one of its rects
    const byG = {}; rooms.forEach(r => { (byG[r.guid] = byG[r.guid] || []).push(r); }); let bad = [], n = 0;
    const st = R.model.storeys.slice().sort((a, b) => a.elev - b.elev);
    R.model.rooms.forEach(m => { let o = null; st.forEach(s => { if (s.elev <= m.cz) o = s; }); if (!o) return; n++;
      const sh = sheetsOf(R).find(x => x.storey.name === o.name); if (!sh) { bad.push(m.guid + ':no_plan'); return; }
      const lines = R.log.filter(l => l.indexOf('§ROOM_LABEL guid=' + m.guid + ' ') === 0); if (lines.length !== 1 || lines[0].indexOf(`storey='${o.name}'`) < 0) { bad.push(m.guid + ':labels=' + lines.length); return; }
      const a = /at=\(([-\d.]+),([-\d.]+)\)/.exec(lines[0]), p = inv([+a[1] / 1000, +a[2] / 1000]);
      if (!byG[m.guid].some(r => Math.abs(p[0] - r.cx) <= r.sx / 2 + 1e-6 && Math.abs(p[1] - r.cy) <= r.sy / 2 + 1e-6)) bad.push(m.guid + ':outside'); });
    return { n, bad };
  };
  const R0 = S.writeStdSet(q, 'W', {}), R1 = S.writeStdSet(q, 'W', { rooms, roomsSource: SRC });
  const L1 = labelsOk(R1, p => p);
  check('R1', 'every room is labelled once on the plan of its storey, inside one of its own rects', L1.n > 0 && L1.bad.length === 0, `rooms=${R1.model.rooms.length} on_a_storey=${L1.n} labels=${R1.log.filter(l => /^§ROOM_LABEL/.test(l)).length} bad=${L1.bad.length} ${L1.bad.slice(0, 3).join(' ')}`);
  const Dm = Mk.deriveMarks(R1, { B, DxfParser, hashHex, MK, SHC, SCOPES: SC }, { set: 'W' }); let stated = true, yellowOk = true;
  sheetsOf(R1).forEach(({ name }) => { const t = R1.files[name]; if (!/\nA-AREA-IDEN/.test(t)) return; const mt = Dm.files[name] || '';
    if (!(/ROOMS: \d+ FROM THE VIEWER ROOM INJECTION/.test(t) && (/\nA-AREA-IDEN-DFLT\r?\n/.test(t) ? /@LAYER=A-AREA-IDEN-DFLT,ignore/.test(mt) : true) && (/\nA-AREA-IDEN\r?\n/.test(t) ? /@LAYER=A-AREA-IDEN,ignore/.test(mt) : true))) stated = false;
    P.parseSync(t).entities.filter(e => e.type === 'TEXT' && /^A-AREA-IDEN/.test(e.layer)).forEach(e => { void e; }); });
  R1.log.filter(l => /^§ROOM_LABEL/.test(l)).forEach(l => { const g = /guid=(\S+)/.exec(l)[1], y = /layer=A-AREA-IDEN-DFLT/.test(l); if (/^RM_/.test(g) !== y) yellowOk = false; });
  check('R2', 'compiled rooms are yellow (A-AREA-IDEN-DFLT), each plan with rooms states the source and marks its room layers ignore', stated && yellowOk, `sheets_stated=${stated} yellow_rule=${yellowOk}`);
  const D0 = Mk.deriveMarks(R0, { B, DxfParser, hashHex, MK, SHC, SCOPES: SC }, { set: 'W' }), rd = Dd => I.convert(I.readSheets(Object.keys(Dd.files).map(n => ({ name: n, text: Dd.files[n] }))), {});
  const v0 = rd(D0), v1 = rd(Dm), b0 = v0.verdict ? v0.verdict.blocking.length : '-', b1 = v1.verdict ? v1.verdict.blocking.length : '-';
  check('R3', 'the reader reads the set the same with and without room labels (refused, blocking)', JSON.stringify(v0.refused || null) === JSON.stringify(v1.refused || null) && b0 === b1, `blocking ${b0} -> ${b1} refused ${JSON.stringify(v0.refused || null).slice(0, 80)} -> ${JSON.stringify(v1.refused || null).slice(0, 80)}`);
  const planNames = new Set(sheetsOf(R1).map(x => x.name)), other = Object.keys(R0.files).filter(n => !planNames.has(n)), diff = other.filter(n => R0.files[n] !== R1.files[n]);
  check('R4', 'with rooms, every sheet but the plans is byte-identical to the set without rooms', other.length > 0 && diff.length === 0 && Object.keys(R0.files).length === Object.keys(R1.files).length, `other_sheets=${other.length} differ=${diff.length} ${diff.join(' ')}`);
  const T = +(process.env.TURN || 0), ws = R0.model.walls, xs = ws.flatMap(e => [e.x0, e.x1]), ys = ws.flatMap(e => [e.y0, e.y1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, th = T * Math.PI / 180;
  const half = (Math.max(...xs) - Math.min(...xs)) / 4, ext = [[cx - half * Math.cos(th), cy - half * Math.sin(th)], [cx + half * Math.cos(th), cy + half * Math.sin(th)]];
  const Rb = S.writeStdSet(q, 'W', { rooms, roomsSource: SRC, wing: { name: 'W', turn: T, pivot: [cx, cy] }, extent: ext, sectionAt: 'pivot' }), wg = Rb.wing, bx = Rb.model.box;
  const a = wg.angle * Math.PI / 180, inv = p => [Math.cos(a) * (p[0] - wg.ox) - Math.sin(a) * (p[1] - wg.oy) + wg.ox, Math.sin(a) * (p[0] - wg.ox) + Math.cos(a) * (p[1] - wg.oy) + wg.oy];
  const Lb = labelsOk(Rb, inv), outside = Rb.model.rooms.filter(r => !(r.at[0] >= bx.a && r.at[0] < bx.b && r.at[1] >= bx.y0 && r.at[1] < bx.y1)).length;
  check('R5', `the wand's box set (turn ${T}, half the building wide) draws only the rooms in the box, each label inside its own rect`, Rb.model.rooms.length > 0 && Rb.model.rooms.length < R1.model.rooms.length && outside === 0 && Lb.bad.length === 0, `kept=${Rb.model.rooms.length}/${R1.model.rooms.length} outside_box=${outside} bad=${Lb.bad.length} ${Lb.bad.slice(0, 3).join(' ')}`);
  say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
