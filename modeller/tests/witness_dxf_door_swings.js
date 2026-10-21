#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DOOR-ANGLED / W-DOOR-DOUBLE / W-DOOR-DEFAULT (rules D16-D18, prompts/DXF2BIM_FOUNDATION_LANE.md). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: doors with no swing on the 2D layouts (owner 2026-10-22: "can the missing door swings be inferred ... yellow band defaults in place of just blanks").
 * Measured before: Hospital 440 / 440 doors without a swing (angled walls), Clinic 6 stated double doors, HHS 34 doors whose operation the IFC does not state.
 *   L  LEGACY   — the Duplex set (axis-aligned, every door stated single swing) is byte-identical to the writer without D16-D18 (BASE=<repo root of the old writer>, optional).
 *   A1 ANGLED   — the Duplex turned 30 deg (DX_ROT30) draws as many door arcs as the Duplex, each hinge = the Duplex hinge turned 30 deg (1 mm), same width, same swing direction.
 *   A2 ANGLED   — on the given model every door arc's hinge lies in its door's plan bbox + 50 mm (a swing drawn on its own door).
 *   A3 GAP      — every rotated gap (§OPENING ... gap=drawn_rotated) leaves the door centre outside every A-WALL polygon of that plan.
 *   D1 DOUBLE   — every stated DOUBLE_DOOR_SINGLE_SWING draws two arcs of OverallWidth / 2 centred on its two jambs (1 mm).
 *   F1 DEFAULT  — every door drawn from the standard is on A-DOOR-DFLT (yellow), never on A-DOOR; a sheet with one states the basis note, @DEFAULT=door.operation_standard and
 *                 @LAYER=A-DOOR-DFLT; the reader takes the set and counts its yellow doors.
 *                 D20: EVERY default drawn (once per footprint; §DOOR_DEFAULT_DUP is the same door twice, not drawn again) is read back as a default:
 *                 read_as_default == defaults (Hospital: 2 doubles on 5-deg walls were refused GAP:no_host, hinge on the wall but off its bbox centre line),
 *                 except a default the reader refuses GAP:no_host with NO wall within host_tol of its drawn hinge: listed one by one (INFO F1), counted
 *                 (refused_no_wall), never silent (LTU: 2 overhead doors drawn at their 3.1 m deep bbox centre, 1.65 m off the wall: a writer finding).
 *   H1 NO_HOST   — D20: a door arc the reader refuses GAP:no_host really has no wall at its hinge (further than host_tol from every wall centre line AND every
 *                 polygon wall outline); the count per building is stated, never silent.
 *   F2 DEFAULT  — with no stated single-swing door in the building (every operation made NOTDEFINED by the test hook) no default is drawn: nothing to stand on.
 * Usage: NODE_PATH=<dir with sql.js> node modeller/tests/witness_dxf_door_swings.js <Node model .db> [DX_ROT30.db DXARC.db]
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), initSqlJs = require('sql.js');
const M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js'), SC = require(D + 'std2d_scopes.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const P = new DxfParser();
(async () => {
  const SQL = await initSqlJs(), open = f => { const db = new SQL.Database(new Uint8Array(fs.readFileSync(f))); return sql => { const r = db.exec(sql); if (!r.length) return []; return r[0].values.map(v => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))); }; };
  const arcsOf = R => { const a = {}; R.log.filter(l => /§DOOR_ARC/.test(l) && /hinge=/.test(l)).forEach(l => { const m = /guid=(\S+) .*hinge=\(([-\d.]+),([-\d.]+)\) width=([\d.]+) swing=\+Y\(([-\d.]+),([-\d.]+)\)/.exec(l); a[m[1]] = { h: [+m[2], +m[3]], w: +m[4], y: [+m[5], +m[6]] }; }); return a; };
  const rot30 = process.argv[3], dux = process.argv[4];
  if (rot30 && dux) {
    const qa = open(dux), qb = open(rot30), Ra = S.writeStdSet(qa, 'W', {}), Rb = S.writeStdSet(qb, 'W', {}), A = arcsOf(Ra), Bb = arcsOf(Rb), th = 30 * Math.PI / 180, rot = p => [Math.cos(th) * p[0] - Math.sin(th) * p[1], Math.sin(th) * p[0] + Math.cos(th) * p[1]];
    const ca = {}, cb = {}; Ra.model.els.filter(e => e.cls === 'IfcDoor').forEach(e => { ca[e.guid] = [(e.x0 + e.x1) * 500, (e.y0 + e.y1) * 500]; }); Rb.model.els.filter(e => e.cls === 'IfcDoor').forEach(e => { cb[e.guid] = [(e.x0 + e.x1) * 500, (e.y0 + e.y1) * 500]; });
    const ks = Object.keys(ca).filter(k => cb[k]); let tx = 0, ty = 0; ks.forEach(k => { const r = rot(ca[k]); tx += cb[k][0] - r[0]; ty += cb[k][1] - r[1]; }); tx /= ks.length; ty /= ks.length;
    const g = Object.keys(A), worst = Math.max(0, ...g.filter(k => Bb[k]).map(k => { const r = rot(A[k].h); return Math.hypot(r[0] + tx - Bb[k].h[0], r[1] + ty - Bb[k].h[1]); })), sameW = g.every(k => Bb[k] && Math.abs(A[k].w - Bb[k].w) < 0.05), sameY = g.every(k => Bb[k] && Math.hypot(rot(A[k].y)[0] - Bb[k].y[0], rot(A[k].y)[1] - Bb[k].y[1]) < 1e-4);
    check('A1', 'a turned Duplex draws every Duplex door swing, each hinge turned with it (1 mm), same width and swing direction', g.length > 0 && g.length === Object.keys(Bb).length && worst <= 1 && sameW && sameY, `arcs ${g.length} / ${Object.keys(Bb).length} worst hinge ${worst.toFixed(2)} mm width=${sameW} dir=${sameY}`);
    if (process.env.BASE) { const SB = require(path.join(process.env.BASE, 'modeller/dxf2bim/std2d.js')), Rl = SB.writeStdSet(qa, 'W', {}); check('L', 'the Duplex set is byte-identical to the writer before D16-D18', Object.keys(Rl.files).every(n => Rl.files[n] === Ra.files[n]) && Object.keys(Rl.files).length === Object.keys(Ra.files).length, 'files=' + Object.keys(Ra.files).length); }
  }
  const q = open(process.argv[2]), R = S.writeStdSet(q, 'W', {}), Mo = R.model, A = arcsOf(R);
  const off = Object.keys(A).filter(k => { const d = Mo.by_guid[k], h = A[k].h; return !(h[0] >= d.x0 * 1000 - 50 && h[0] <= d.x1 * 1000 + 50 && h[1] >= d.y0 * 1000 - 50 && h[1] <= d.y1 * 1000 + 50); });
  check('A2', 'every door arc is hinged on its own door (hinge in the door bbox + 50 mm)', Object.keys(A).length > 0 && off.length === 0, `arcs=${Object.keys(A).length} angled_basis=${R.log.filter(l => /ifc_convention_rotated|swing_axis=frame/.test(l)).length} off=${off.length} ${off.slice(0, 3).join(' ')}`);
  // A3: rotated gaps really open the wall at the door
  const inPoly = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const rotated = R.log.filter(l => /gap=drawn_rotated/.test(l)).map(l => /guid=(\S+)/.exec(l)[1]); let blocked = [];
  R.views.plan.forEach(({ view, storey }) => { const name = Object.keys(R.files).find(n => n.endsWith('_' + view + '_std.dxf')); if (!name) return;
    const walls = P.parseSync(R.files[name]).entities.filter(e => /^A-WALL/.test(e.layer) && e.type === 'LWPOLYLINE').map(e => e.vertices.map(v => [v.x, v.y]));
    rotated.map(g => Mo.by_guid[g]).filter(d => d && d.storey === storey.name).forEach(d => { const c = [(d.x0 + d.x1) * 500, (d.y0 + d.y1) * 500]; if (walls.some(w => inPoly(c, w))) blocked.push(d.guid); }); });
  check('A3', 'a door gap cut in an angled wall leaves the door centre outside every wall polygon', blocked.length === 0, `rotated_gaps=${rotated.length} blocked=${blocked.length} ${blocked.slice(0, 3).join(' ')}`);
  // D1: stated double doors: two arcs of w/2 at the jambs
  const dbl = R.log.filter(l => /§DOOR_ARC .*leaves=2 .*\(D17\)/.test(l)).map(l => /guid=(\S+)/.exec(l)[1]); let dblBad = [];
  dbl.forEach(g => { const d = Mo.by_guid[g], op = Mo.door_ops[g], X = [op.x[0], op.x[1]], Y = [op.y[0], op.y[1]], w = Number(op.w), name = Object.keys(R.files).find(n => R.views.plan.some(v => v.storey.name === d.storey && n.endsWith('_' + v.view + '_std.dxf')));
    const cn = [[d.x0, d.y0], [d.x1, d.y0], [d.x1, d.y1], [d.x0, d.y1]], cs = cn.map(c => c[0] * X[0] + c[1] * X[1]), ct = cn.map(c => c[0] * Y[0] + c[1] * Y[1]), sc = (Math.min(...cs) + Math.max(...cs)) / 2, tc = (Math.min(...ct) + Math.max(...ct)) / 2;
    const jambs = [sc - w / 2, sc + w / 2].map(a => [(a * X[0] + tc * Y[0]) * 1000, (a * X[1] + tc * Y[1]) * 1000]), arcs = P.parseSync(R.files[name]).entities.filter(e => e.type === 'ARC' && e.layer === 'A-DOOR');
    const ok = jambs.every(j => arcs.some(a => Math.hypot(a.center.x - j[0], a.center.y - j[1]) <= 1 && Math.abs(a.radius - w * 500) <= 1)); if (!ok) dblBad.push(g); });
  if (dbl.length) check('D1', 'every stated double door draws two arcs of half its width centred on its two jambs', dblBad.length === 0, `double=${dbl.length} bad=${dblBad.length}`); else say('INFO D1 | no stated double door in this model');
  // the reader over the whole set once (F1, H1)
  const Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC, SCOPES: SC }, { set: 'W' }), out = I.convert(I.readSheets(Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] }))), {}), po = out.qualifyInput ? out.qualifyInput.plan_ops : {}, tol = SHC.CFG.host_tol;
  const d2s = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  const wallDist = (h, ws) => Math.min(Infinity, ...ws.map(w => Math.min(d2s(h, w.params.start, w.params.end), !(w.params.polygon && w.params.outline) ? Infinity : inPoly(h, w.params.outline) ? 0 : Math.min(...w.params.outline.map((a, i, P) => d2s(h, a, P[(i + 1) % P.length]))))));
  const noHost = []; let byOutline = 0;   // every GAP:no_host door arc: [sheet, handle, hinge, distance to the nearest wall centre line / polygon outline]
  Object.keys(po).forEach(sh => { const ws = po[sh].filter(o => o.op_type === 'DXF_WALL');
    byOutline += po[sh].filter(o => o.op_type === 'DXF_OPENING' && o.params.host_basis === 'outline').length;
    po[sh].filter(o => o.op_type === 'DXF_GAP' && o.params.code === 'GAP:no_host' && o.params.hinge).forEach(o => noHost.push({ sh, handle: o.params.handle, layer: o.params.layer, hinge: o.params.hinge, dist: wallDist(o.params.hinge, ws) })); });
  // F1: defaults are yellow, stated, and EVERY one is read back as a default, or is a listed reader refusal (GAP:no_host with no wall at the drawn hinge, H1)
  const dflt = R.log.filter(l => /§DOOR_DEFAULT guid=/.test(l)).map(l => /guid=(\S+)/.exec(l)[1]);
  if (dflt.length) {
    let onDoor = 0, sheetsOk = true; const refused = [];
    R.views.plan.forEach(({ view, storey }) => { const name = Object.keys(R.files).find(n => n.endsWith('_' + view + '_std.dxf')); if (!name) return; const ents = P.parseSync(R.files[name]).entities, mine = dflt.map(g => Mo.by_guid[g]).filter(d => d.storey === storey.name); if (!mine.length) return;
      mine.forEach(d => { const inBox = e => e.type === 'ARC' && e.center.x >= d.x0 * 1000 - 50 && e.center.x <= d.x1 * 1000 + 50 && e.center.y >= d.y0 * 1000 - 50 && e.center.y <= d.y1 * 1000 + 50; if (ents.some(e => e.layer === 'A-DOOR' && inBox(e))) onDoor++;
        const hs = P.parseSync(Dm.files[name] || '').entities.filter(e => e.layer === 'A-DOOR-DFLT' && inBox(e)).map(e => e.handle), r = noHost.find(x => x.sh === name && hs.indexOf(x.handle) >= 0); if (r) refused.push({ guid: d.guid, r }); });
      const mt = Dm.files[name] || ''; if (!(/YELLOW = DEFAULT/.test(R.files[name]) && /@DEFAULT=door\.operation_standard,SINGLE_SWING_(LEFT|RIGHT)/.test(mt) && /@LAYER=A-DOOR-DFLT,opening/.test(mt))) sheetsOk = false; });
    refused.forEach(x => say(`INFO F1 | default not read back, listed: guid=${x.guid} ${x.r.sh}:${x.r.handle} GAP:no_host hinge=(${x.r.hinge.join(',')}) nearest wall ${x.r.dist.toFixed(3)} m > host_tol ${tol} m (the drawn hinge is off every wall)`));
    check('F1', 'doors drawn from the standard are yellow (A-DOOR-DFLT) and never A-DOOR, their sheets state the basis + @DEFAULT + @LAYER, and EVERY one is read back as a default or is a listed refusal with no wall at its drawn hinge (D20)', onDoor === 0 && sheetsOk && !out.refused && out.defaultDoors > 0 && out.defaultDoors + refused.length === dflt.length && refused.every(x => x.r.dist > tol), `defaults=${dflt.length} dup=${R.log.filter(l => /§DOOR_DEFAULT_DUP/.test(l)).length} on_A-DOOR=${onDoor} sheets_stated=${sheetsOk} read_as_default=${out.defaultDoors} refused_no_wall=${refused.length} blocking=${out.verdict ? out.verdict.blocking.length : '-'}`);
  } else say('INFO F1 | no door without a stated operation in this model');
  // H1 (D20): every GAP:no_host door arc has no wall at its hinge (no centre line and no polygon outline within host_tol)
  const nearWall = noHost.filter(x => x.dist <= tol);
  check('H1', 'a door arc refused GAP:no_host has no wall at its hinge (no centre line and no polygon outline within host_tol): listed, never a missed host', nearWall.length === 0, `no_host=${noHost.length} (A-DOOR-DFLT ${noHost.filter(x => x.layer === 'A-DOOR-DFLT').length}) with_wall_at_hinge=${nearWall.length} hosted_by_outline=${byOutline} host_tol=${tol} nearest_wall_min=${noHost.length ? Math.min(...noHost.map(x => x.dist)).toFixed(3) : '-'} m ${nearWall.slice(0, 3).map(x => x.sh + ':' + x.handle).join(' ')}`);
  const R2 = S.writeStdSet(q, 'W', { premodel: m => { Object.values(m.door_ops || {}).forEach(o => { o.op = 'NOTDEFINED'; }); } });
  check('F2', 'no stated single-swing door in the building -> no default drawn (nothing to stand on), each such door a listed gap', !R2.log.some(l => /§DOOR_DEFAULT guid=/.test(l)) && R2.gaps.some(g => /no standard to draw from/.test(g[2] || '')), `defaults=${R2.log.filter(l => /§DOOR_DEFAULT guid=/.test(l)).length} no_standard_gaps=${R2.gaps.filter(g => /no standard/.test(g[2] || '')).length}`);
  say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
