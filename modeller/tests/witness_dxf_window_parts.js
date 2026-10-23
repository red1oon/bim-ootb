#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-WINDOW-PARTS (rules D55 / D55b, prompts/DXF2BIM_FOUNDATION_LANE.md §D55). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: JKR draws a window as separate parts (mullions, frames, panes 2.4 / 50 mm apart): at the 1 mm join one window was up to 5 clusters, only the tagged one
 * labelled and none spanning its wall gap (Level 1: 0 window openings of 24); and a window drawn wider than its gap (frame posts 20 mm into the jambs) was unbounded.
 *   P1 ONE      — no window the writer's plans cut is lost (reader windows >= the writer's cut ones) and none is split (no two window openings of a storey within 0.05 m).
 *   P2 READ     — the model-marked set: the total and no_elevation_for_face fall against BASE; a code that rises is a later window stage only (lod400 library (no library in Node),
 *                  opening_gap_unbounded, opening_outside_wall): windows now read meet the next check.
 *   P3 SAME     — a set whose glazing pieces all touch reads byte-identical to BASE (guid, class, vertices).
 *   P4 FALSIFIER — DXF_WINDOW_PART_GAP=0.001 and DXF_WINDOW_EMBED=0.000001 (the rules off) bring P1's split back (fewer window openings).
 * Usage: NODE_PATH=<dir with better-sqlite3> BASE=<old modeller dir> node modeller/tests/witness_dxf_window_parts.js <Node model .db> [<more .db>]
 */
'use strict';
const path = require('path'), crypto = require('crypto'), cp = require('child_process'), M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js'), SC = require(D + 'std2d_scopes.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js'));
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
const BASE = process.env.BASE ? require(path.join(process.env.BASE, 'dxf2bim_import.js')) : null;
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const dbs = process.argv.slice(2).filter(a => a !== '--count'); if (!dbs.length) { say('MISSING input: a Node model .db (e.g. /tmp/db2/JKR2.db)'); process.exit(2); }
const DOWNSTREAM = ['GAP:lod400_library_unreachable', 'GAP:opening_gap_unbounded', 'GAP:opening_outside_wall'];   // the window codes a window meets only once it is READ as a window (a later stage)
const codes = v => { const m = {}; v.blocking.forEach(b => { m[b.code] = (m[b.code] || 0) + 1; }); return m; };
dbs.forEach(db => {
  const name = path.basename(db, '.db'), con = new Database(db, { readonly: true }), q = s => con.prepare(s).all();
  const R = S.writeStdSet(q, 'X', {}), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC, SCOPES: SC }, { set: 'X' }), files = Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] }));
  const o = I.convert(I.readSheets(files), {}); if (!o.ST) { check('P0[' + name + ']', 'converts', false, JSON.stringify(o.refused).slice(0, 200)); return; }
  const got = o.ST.map(st => st.after.filter(x => x.op_type === 'DXF_OPENING' && x.params.kind === 'window').length), cutW = R.log.filter(l => /^§OPENING .*cls=IfcWindow/.test(l) && / pos=cut /.test(l)).length, nW = got.reduce((a, b) => a + b, 0);
  if (process.argv.includes('--count')) { say('§WINDOWS ' + nW); return; }
  const split = []; o.ST.forEach(st => { const W = st.after.filter(x => x.op_type === 'DXF_OPENING' && x.params.kind === 'window' && x.params.bbox);
    for (let i = 0; i < W.length; i++) for (let j = i + 1; j < W.length; j++) { const a = W[i].params.bbox, b = W[j].params.bbox, d = Math.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3])); if (d <= 0.05 && W[i].params.handle !== W[j].params.handle) split.push(st.name + ':' + W[i].params.handle + '+' + W[j].params.handle); } });
  check('P1[' + name + ']', 'no window the plans cut is lost and none is split (no two window openings of a storey, from different plan outlines, within 0.05 m; stacked windows of one outline are one plan window)', nW >= cutW && !split.length, `cut_by_the_writer=${cutW} read=${nW} per_storey=${got.join('/')} split_pairs=${split.length} ${split.slice(0, 3).join(' ')}`);
  if (BASE) { const b = BASE.convert(BASE.readSheets(files), {}), c0 = codes(b.verdict), c1 = codes(o.verdict), rose = Object.keys(c1).filter(k => c1[k] > (c0[k] || 0)), same = JSON.stringify(o.els.map(e => [e.guid, e.class, e.vertices])) === JSON.stringify(b.els.map(e => [e.guid, e.class, e.vertices]));
    if (same) check('P3[' + name + ']', 'nothing changes where the glazing pieces touch: byte-identical to BASE', true, `els=${o.els.length}`);
    else check('P2[' + name + ']', 'window gaps fall and the total falls; whatever rises is a later window stage (library / gap / wall height)', (c1['GAP:no_elevation_for_face'] || 0) <= (c0['GAP:no_elevation_for_face'] || 0) && rose.every(k => DOWNSTREAM.indexOf(k) >= 0) && o.verdict.blocking.length <= b.verdict.blocking.length,
      `blocking ${b.verdict.blocking.length} -> ${o.verdict.blocking.length} no_face ${c0['GAP:no_elevation_for_face'] || 0}->${c1['GAP:no_elevation_for_face'] || 0} unbounded ${c0['GAP:opening_gap_unbounded'] || 0}->${c1['GAP:opening_gap_unbounded'] || 0} rose: ${rose.map(k => k.replace('GAP:', '') + ' ' + (c0[k] || 0) + '->' + c1[k]).join(', ') || 'none'}`); }
  if (nW > 0 && nW === cutW && got.some((n, i) => n > 0)) { const r = cp.spawnSync('node', [__filename, db, '--count'], { encoding: 'utf8', env: Object.assign({}, process.env, { DXF_WINDOW_PART_GAP: '0.001', DXF_WINDOW_EMBED: '0.000001', BASE: '' }) });
    const off = Number((/§WINDOWS (\d+)/.exec(r.stdout || '') || [])[1]);
    check('P4[' + name + ']', 'with both rules off the windows read are fewer or the same; on JKR fewer (the rules are what joins them)', Number.isFinite(off) && off <= nW && (name !== 'JKR2' || off < nW), `rules_on=${nW} rules_off=${off}`); }
});
say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
