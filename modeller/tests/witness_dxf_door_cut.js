#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DOOR-CUT (rule D19, prompts/DXF2BIM_FOUNDATION_LANE.md). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: "many doors uncut swings" (owner 2026-10-22) on the 2D layouts, measured on EVERY door of every plan sheet (A3 in
 * witness_dxf_door_swings.js ran only on the rotated gaps).
 *   C1 OPEN     — no door drawn with a swing has its wall left closed: none of 7 points on the door's width line (centre +- 0.25 / 0.5 / 0.8 of the width / 2
 *                 along its placement X, else the bbox long axis) lies inside an A-WALL* polygon of its plan.
 *   C2 SWING    — every door on a plan sheet has a swing (an ARC on A-DOOR or A-DOOR-DFLT centred within its bbox + 100 mm); before D19 the LTU had 16 doors
 *                 cut in the wall with no swing (GAP:door_handing_conflict).
 *   C3 STATED   — a door whose mesh contradicts its stated handing is drawn YELLOW (A-DOOR-DFLT), never A-DOOR, logged §DOOR_HANDING_CONFLICT, its sheet states it
 *                 (YELLOW = UNCHECKED note, @LAYER=A-DOOR-DFLT marking) and it is no longer a GAP.
 *   INFO        — swings with no wall drawn at them (GAP:opening_host_not_cut / opening_no_host on a door with an arc): a model fact, counted, not changed.
 * Optional TURN=<deg>: the same on the wand's box set (pivot = wall envelope centre, plane 1 km long, no depth), as the Viewer calls it.
 * Usage: NODE_PATH=<dir with sql.js> node modeller/tests/witness_dxf_door_cut.js <Node model .db | _2d.db sidecar> [more dbs]
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), initSqlJs = require('sql.js');
const M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js'), SC = require(D + 'std2d_scopes.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), P = new DxfParser();
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const inPoly = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
(async () => {
  const SQL = await initSqlJs();
  for (const f of process.argv.slice(2)) {
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(f))), q = sql => { const r = db.exec(sql); if (!r.length) return []; return r[0].values.map(v => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))); };
    let wo = {};
    if (process.env.TURN !== undefined) {
      const ws = S.writeStdSet(q, 'W', {}).model.walls, xs = ws.flatMap(w => [w.x0, w.x1]), ys = ws.flatMap(w => [w.y0, w.y1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, t = +process.env.TURN * Math.PI / 180;
      wo = { wing: { name: 'W', turn: +process.env.TURN, pivot: [cx, cy] }, sectionAt: 'pivot', extent: [[cx - 500 * Math.cos(t), cy - 500 * Math.sin(t)], [cx + 500 * Math.cos(t), cy + 500 * Math.sin(t)]] };
    }
    const R = S.writeStdSet(q, 'W', wo), Mo = R.model, tagd = path.basename(f) + (process.env.TURN !== undefined ? ' turn=' + process.env.TURN : '');
    const arcLog = new Set(R.log.filter(l => /^§DOOR_(ARC|DEFAULT) guid=/.test(l)).map(l => /guid=(\S+)/.exec(l)[1]));
    let doors = 0, closed = [], noSwing = [], conflictOnDoor = 0;
    const conf = R.log.filter(l => /^§DOOR_HANDING_CONFLICT guid=/.test(l)).map(l => /guid=(\S+)/.exec(l)[1]);
    R.views.plan.forEach(({ view, storey }) => {
      const name = Object.keys(R.files).find(n => n.endsWith('_' + view + '_std.dxf')); if (!name) return;
      const ents = P.parseSync(R.files[name]).entities, walls = ents.filter(e => /^A-WALL/.test(e.layer) && e.type === 'LWPOLYLINE').map(e => e.vertices.map(v => [v.x, v.y]));
      const arcs = ents.filter(e => e.type === 'ARC' && /^A-DOOR(-DFLT)?$/.test(e.layer));
      Mo.els.filter(e => e.cls === 'IfcDoor' && e.storey === storey.name).forEach(d => {
        doors++; const T = 100, own = arcs.filter(a => a.center.x >= d.x0 * 1000 - T && a.center.x <= d.x1 * 1000 + T && a.center.y >= d.y0 * 1000 - T && a.center.y <= d.y1 * 1000 + T);
        if (!own.length) { noSwing.push(d.guid); return; }
        if (conf.indexOf(d.guid) >= 0 && own.some(a => a.layer === 'A-DOOR')) conflictOnDoor++;
        const op = Mo.door_ops[d.guid] || {}, c = [(d.x0 + d.x1) * 500, (d.y0 + d.y1) * 500];
        const X = op.x && Math.abs(Math.hypot(op.x[0], op.x[1]) - 1) < 1e-3 ? [op.x[0], op.x[1]] : ((d.x1 - d.x0) >= (d.y1 - d.y0) ? [1, 0] : [0, 1]), w = op.w ? Number(op.w) * 1000 : Math.max(d.x1 - d.x0, d.y1 - d.y0) * 1000;
        const pts = [-0.8, -0.5, -0.25, 0, 0.25, 0.5, 0.8].map(k => [c[0] + k * w / 2 * X[0], c[1] + k * w / 2 * X[1]]);
        if (pts.some(p => walls.some(wl => inPoly(p, wl)))) closed.push(d.guid);
      });
    });
    check('C1', `[${tagd}] no door drawn with a swing has its wall left closed (7 points of its width line outside every A-WALL polygon)`, closed.length === 0, `doors_with_swing=${doors - noSwing.length} closed=${closed.length} ${closed.slice(0, 3).join(' ')}`);
    check('C2', `[${tagd}] every door on a plan sheet has a swing (A-DOOR / A-DOOR-DFLT arc at it)`, noSwing.length === 0, `doors=${doors} no_swing=${noSwing.length} ${noSwing.slice(0, 3).map(g => g + ':' + ((R.gaps.find(x => x[1] === g) || [])[0] || '-')).join(' ')}`);
    if (conf.length) {
      const Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC, SCOPES: SC }, { set: 'W' }); let stated = true;
      R.views.plan.forEach(({ view, storey }) => { const name = Object.keys(R.files).find(n => n.endsWith('_' + view + '_std.dxf')); if (!name) return; if (!conf.some(g => Mo.by_guid[g] && Mo.by_guid[g].storey === storey.name)) return;
        if (!(/YELLOW = UNCHECKED/.test(R.files[name]) && /@LAYER=A-DOOR-DFLT,opening/.test(Dm.files[name] || ''))) stated = false; });
      const stillGap = R.gaps.filter(g => g[0] === 'GAP:door_handing_conflict' && conf.indexOf(g[1]) >= 0).length;
      check('C3', `[${tagd}] a door whose mesh contradicts its stated handing is drawn yellow, stated on its sheet, no longer a GAP`, conflictOnDoor === 0 && stated && stillGap === 0, `conflicts=${conf.length} on_A-DOOR=${conflictOnDoor} sheets_stated=${stated} still_gap=${stillGap}`);
    } else say(`INFO C3 | [${tagd}] no handing conflict in this model`);
    const midAir = R.gaps.filter(g => /opening_host_not_cut|opening_no_host/.test(g[0]) && arcLog.has(g[1]) && Mo.by_guid[g[1]] && Mo.by_guid[g[1]].cls === 'IfcDoor');
    say(`INFO swing_no_wall | [${tagd}] doors drawn with a swing where no host wall is drawn (model fact, listed GAP): ${midAir.length} ${JSON.stringify(midAir.reduce((a, g) => (a[g[0]] = (a[g[0]] || 0) + 1, a), {}))}`);
  }
  say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
