#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-SLAB-ESTIMATE (rule D51, prompts/DXF2BIM_FOUNDATION_LANE.md §D51). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: after D44 a building whose walls do not draw a rectangle (HHS, Clinic, LTU) had NO slab, so 5D had no floor at all; the owner asked for a fast best-effort
 * default, amber, editable later (one JSON value or one marking).
 *   E1 ESTIMATE  — each storey D44 leaves without a slab (and whose section gives the slab's thickness) gets ONE amber slab (prov derived) whose top area = the area the walls bound on both axes,
 *                  and ONE advisory GAP:slab_outline_estimated naming that area, the rectangle's area and the setting.
 *   E2 YOUR WORD — @DEFAULT=slab.outline_when_not_rect,none on a plan: no slab on those storeys, GAP:slab_outline_not_rectangular as in D44.
 *   E3 RECTANGLE — a set whose walls draw a rectangle (Duplex) is byte-identical to BASE (guid, class, vertices of every element).
 *   E4 ONLY SLABS — every non-slab element identical to BASE by guid + vertices.
 * Usage: NODE_PATH=<dir with better-sqlite3> BASE=<old modeller dir> node modeller/tests/witness_dxf_slab_estimate.js <Node model .db> [<more .db>]
 */
'use strict';
const path = require('path'), crypto = require('crypto'), M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js'), SC = require(D + 'std2d_scopes.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js'));
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
const BASE = process.env.BASE ? require(path.join(process.env.BASE, 'dxf2bim_import.js')) : null;
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const dbs = process.argv.slice(2); if (!dbs.length) { say('MISSING input: a Node model .db (e.g. /tmp/db2/HHSM2.db)'); process.exit(2); }
const topArea = e => { let a = 0; e.faces.forEach(f => { const p = f.map(i => e.vertices[i]); if (!p.every(q => Math.abs(q[2] - p[0][2]) < 1e-9)) return; const cr = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]); if (cr > 0) a += cr / 2; }); return a; };
dbs.forEach(db => {
  const name = path.basename(db, '.db'), con = new Database(db, { readonly: true }), q = s => con.prepare(s).all();
  const R = S.writeStdSet(q, 'X', {}), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC, SCOPES: SC }, { set: 'X' });
  const files = Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] })), o = I.convert(I.readSheets(files), {});
  if (!o.els) { check('E0[' + name + ']', 'the marked set converts', false, JSON.stringify(o.refused).slice(0, 200)); return; }
  const est = o.verdict.advisory.filter(a => a.code === 'GAP:slab_outline_estimated'), left = o.verdict.advisory.filter(a => a.code === 'GAP:slab_outline_not_rectangular');
  const bad = []; est.forEach(a => { const st = o.ST.find(x => x.sheet === a.sheet), sl = o.els.filter(e => e.class === 'IfcSlab' && e.storey === st.name), d = a.detail || {};
    if (sl.length !== 1 || sl[0].prov !== 'derived') bad.push(st.name + ':slabs=' + sl.length); else if (Math.abs(topArea(sl[0]) - d.estimated_m2) > 0.01) bad.push(st.name + ':area ' + topArea(sl[0]).toFixed(2) + '!=' + d.estimated_m2);
    if (!(d.rect_m2 > 0) || d.setting !== 'slab.outline_when_not_rect') bad.push(st.name + ':gap_without_numbers'); });
  check('E1[' + name + ']', 'each storey with an undrawn rectangle (and a slab thickness) gets one amber slab of the walls-bounded area, stated', !bad.length, `estimated=${est.length} ${est.map(a => (a.detail || {}).estimated_m2 + 'm2 of ' + (a.detail || {}).rect_m2).join(', ')} left_out=${left.length} ${bad.join(' ')}`);
  if (est.length) {   // E2: the user's word on the first plan
    const plan = files.find(f => /_FLOOR_/.test(f.name)), f2 = files.map(f => f !== plan ? f : { name: f.name, text: MK.writeMarks(f.text, [{ text: '@DEFAULT=slab.outline_when_not_rect,none @BY=user', x: 0, y: 0 }]) });
    const o2 = I.convert(I.readSheets(f2), {}), est2 = o2.verdict.advisory.filter(a => a.code === 'GAP:slab_outline_estimated').length, left2 = o2.verdict.advisory.filter(a => a.code === 'GAP:slab_outline_not_rectangular').length;
    check('E2[' + name + ']', '@DEFAULT ...,none: no estimated slab, the storeys listed as D44', est2 === 0 && left2 === est.length + left.length && !o2.els.some(e => e.class === 'IfcSlab' && e.prov === 'derived'), `estimated=${est2} left_out=${left2}`);
  }
  if (BASE) { const b = BASE.convert(BASE.readSheets(files), {}), key = e => e.guid + '|' + JSON.stringify(e.vertices);
    if (!est.length && !left.length) check('E3[' + name + ']', 'walls that draw a rectangle: byte-identical to BASE', JSON.stringify(o.els.map(e => [e.guid, e.class, e.vertices])) === JSON.stringify(b.els.map(e => [e.guid, e.class, e.vertices])), `els=${o.els.length}`);
    const A = new Set(o.els.filter(e => e.class !== 'IfcSlab').map(key)), Bs = new Set(b.els.filter(e => e.class !== 'IfcSlab').map(key)), diff = [...A].filter(k => !Bs.has(k)).length + [...Bs].filter(k => !A.has(k)).length;
    check('E4[' + name + ']', 'nothing but slabs changes against BASE', diff === 0, `non_slab=${A.size} differ=${diff} slabs ${b.els.filter(e => e.class === 'IfcSlab').length}->${o.els.filter(e => e.class === 'IfcSlab').length}`); }
  else say('INCONCLUSIVE E3/E4[' + name + '] | no BASE given');
});
say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
