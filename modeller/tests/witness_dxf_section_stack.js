#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-SECTION-STACK (rule D57, prompts/DXF2BIM_FOUNDATION_LANE.md §D57). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: a section that draws floor finishes on the structural slab (JKR: 20 mm tiles on 85 + 85 mm planks) was read as "two slab bottoms at one level" = a conflict,
 * so the level had no slab underside and every wall below it stayed an ask.
 *   K1 UNCHANGED — a set whose levels all read today: verdict code for code and every slabZ equal to BASE (the rule runs only where today's reader returns section_slab_conflict).
 *   K2 AGREE     — (synthetic) finishes of two thicknesses on slabs with one underside: READ, stacked, no advisory, underside = the slabs' bottom.
 *   K3 STEPPED   — stacks with different bottoms: the bottom under the longest cut, ONE GAP:section_underside_defaulted per level (advisory) with its share; on a real set (JKR with STR) the
 *                  conflicts go and the slab under the level gets that underside.
 *   K4 OFF       — slab.underside_when_stepped = none: the verdict of BASE, code for code (a level whose stacks agree is read either way).
 *   K5 FALSIFIER — (synthetic, one finish over the whole cut) the stepped lengths mirrored pick the other bottom; the rect order reversed picks the same (the share decides); none = today's 20 mm finish.
 * Usage: NODE_PATH=<dir with better-sqlite3> BASE=<a modeller dir before D57> node modeller/tests/witness_dxf_section_stack.js <Node model .db> [<more .db>]
 */
'use strict';
const path = require('path'), crypto = require('crypto'), M = path.join(__dirname, '..');
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3')), hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0, judged = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { judged++; if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const load = dir => { const D = path.join(dir, 'dxf2bim') + '/'; return { S: require(D + 'std2d.js'), Mk: require(D + 'std2d_marks.js'), MK: require(D + 'dxf2marks.js'), B: require(D + 'dxf2bim.js'), SHC: require(D + 'dxf2shell_config.js'), SC: require(D + 'std2d_scopes.js'),
  SH: require(D + 'dxf2shell.js'), DxfParser: require(path.join(dir, 'lib/dxf-parser.js')), I: require(path.join(dir, 'dxf2bim_import.js')), REF: require(path.join(dir, 'element_defaults.json')) }; };
const N = load(M), BASE = process.env.BASE ? load(path.resolve(process.env.BASE)) : null;
const codes = v => { const m = {}; (v ? v.blocking.concat(v.advisory) : []).forEach(b => { m[b.code] = (m[b.code] || 0) + 1; }); return m; };
const cdiff = (a, b) => Object.keys(Object.assign({}, a, b)).filter(k => a[k] !== b[k]).map(k => k + ' ' + (a[k] || 0) + '->' + (b[k] || 0));
const sheetsOf = (X, q) => { const R = X.S.writeStdSet(q, 'X', {}), Dm = X.Mk.deriveMarks(R, { B: X.B, DxfParser: X.DxfParser, hashHex, MK: X.MK, SHC: X.SHC, SCOPES: X.SC }, { set: 'X' }); return Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] })); };
const off = JSON.parse(JSON.stringify(N.REF)); off.defaults['slab.underside_when_stepped'].value = 'none';
// K2 / K5: synthetic sections through the real sectionSlabs (identity map: plan h = x, z = y; layer S-SLAB = sectslab in the STD map)
const LM = N.MK.withLayers(N.I.setWith('STD').MAP_SECT, { layers: [] }), ID = { toPlan: x => x, zOf: y => y }, CFG = N.SHC.CFG;
const rect = (h, a, b, z0, z1) => ({ type: 'LWPOLYLINE', shape: true, layer: 'S-SLAB', handle: h, vertices: [{ x: a, y: z0 }, { x: b, y: z0 }, { x: b, y: z1 }, { x: a, y: z1 }] });
const syn = (ents, stepped) => N.SH.sectionSlabs(ents, LM, ID, [3], CFG, undefined, { stepped: stepped });
{ const r = syn([rect('A1', 0, 4, 2.98, 3), rect('A2', 4, 8, 2.99, 3), rect('A3', 0, 4, 2.80, 2.98), rect('A4', 4, 8, 2.80, 2.99)], 'longest_cut'), s3 = r.slabs['3'];
  check('K2[synthetic]', 'finishes of two thicknesses on slabs with one underside are READ: stacked, no advisory', !!s3 && s3.bottom === 2.8 && s3.stacked === true && !s3.defaulted && !r.gaps.length,
    `slab=${JSON.stringify(s3)} gaps=${JSON.stringify(r.gaps.map(g => g.code))}`); }
{ const E = [rect('B1', 0, 8, 2.98, 3), rect('B2', 0, 6, 2.80, 2.98), rect('B3', 6, 8, 2.70, 2.98)], a = syn(E, 'longest_cut').slabs['3'], b = syn(E.slice().reverse(), 'longest_cut').slabs['3'];
  const Mr = [rect('C1', 0, 8, 2.98, 3), rect('C2', 0, 2, 2.80, 2.98), rect('C3', 2, 8, 2.70, 2.98)], c = syn(Mr, 'longest_cut').slabs['3'], n = syn(E, 'none');
  const nb = n.slabs['3'];
  check('K5[synthetic]', 'the share decides: 6 m at 2.80 + 2 m at 2.70 -> 2.80 (either rect order); mirrored -> 2.70; none -> today\'s reading (the 20 mm finish, 2.98)', a && b && c && a.bottom === 2.8 && b.bottom === 2.8 && c.bottom === 2.7 && a.defaulted && a.share === 0.75 && !!nb && nb.bottom === 2.98 && !nb.stacked,
    `pick=${a && a.bottom} reversed=${b && b.bottom} mirrored=${c && c.bottom} share=${a && a.share} none=${nb && nb.bottom}`); }
const dbs = process.argv.slice(2); if (!dbs.length) say('INFO K1/K3/K4 need db args (e.g. /tmp/db2/HHSM2.db /tmp/db2/JKR3.db)');
if (dbs.length && !BASE) say('INFO K1/K4 need BASE=<a modeller dir before D57>');
dbs.forEach(db => {
  const name = path.basename(db, '.db'), con = new Database(db, { readonly: true }), q = s => con.prepare(s).all();
  const files = sheetsOf(N, q), C1 = N.I.convert(N.I.readSheets(files), {}), C0 = BASE ? BASE.I.convert(BASE.I.readSheets(files), {}) : null;
  if (C1.refused) { say('INCONCLUSIVE [' + name + '] | the convert refused: ' + JSON.stringify(C1.refused).slice(0, 160)); return; }
  const confl = C0 ? (C0.section && C0.section.gaps || []).filter(g => g.code === 'GAP:section_slab_conflict') : null;
  if (BASE && !confl.length) {
    const d = cdiff(codes(C0.verdict), codes(C1.verdict)), sz = JSON.stringify(C0.slabZ) === JSON.stringify(C1.slabZ);
    check('K1[' + name + ']', 'no section conflict today -> verdict code for code and every slabZ = BASE', !d.length && sz, `blocking ${C0.verdict.blocking.length} -> ${C1.verdict.blocking.length} differ=${JSON.stringify(d)} slabZ_equal=${sz} read=${Object.keys(C1.section ? C1.section.slabs : {}).join(',')}`);
    return;
  }
  const dfl = (C1.section.gaps || []).filter(g => g.code === 'GAP:section_underside_defaulted'), cf1 = (C1.section.gaps || []).filter(g => g.code === 'GAP:section_slab_conflict');
  const lv = (confl || []).map(g => g.level), got = lv.map(L => { const s = C1.section.slabs[String(L)]; return L + '->' + (s ? s.bottom + (s.defaulted ? ' (default, ' + Math.round(s.share * 100) + '%)' : ' (read)') : 'none'); });
  const adv = new Set(C1.verdict.advisory.map(a => a.code)), d = C0 ? cdiff(codes(C0.verdict), codes(C1.verdict)) : [];
  check('K3[' + name + ']', 'every level BASE called a conflict now has an underside (read or one amber advisory), the conflicts are gone, the advisory is advisory', !!C0 && cf1.length === 0 && lv.every(L => !!C1.section.slabs[String(L)]) && dfl.every(g => adv.has(g.code)) && dfl.length <= lv.length,
    `levels=${JSON.stringify(got)} advisories=${dfl.length} blocking ${C0 && C0.verdict.blocking.length} -> ${C1.verdict.blocking.length} differ=${JSON.stringify(d)}`);
  const C2 = N.I.convert(N.I.readSheets(files), { defaultsRef: off }), d2 = cdiff(codes(C0.verdict), codes(C2.verdict)), stk = lv.filter(L => C2.section.slabs[String(L)]);
  check('K4[' + name + ']', 'slab.underside_when_stepped=none -> BASE code for code (unless a level\'s stacks agree: then it is read, not defaulted)', !d2.length || stk.length > 0, `differ=${JSON.stringify(d2)} read_when_none=${JSON.stringify(stk)}`);
});
say('SUMMARY fail=' + fail + ' judged=' + judged); process.exit(fail ? 1 : 0);
