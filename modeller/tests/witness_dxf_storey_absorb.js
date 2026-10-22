#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-STOREY-ABSORB (rule D50, prompts/DXF2BIM_FOUNDATION_LANE.md §D50). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: JKR's 00 Aras Tanah (+81.0) and 01 Aras Satu (+81.2) are 0.2 m apart: the 00 plan's cut (+82.2) lies above the 01 level, so it drew the same walls as 01 and
 * the 01 doors / windows as bare cut outlines with no openings (902 blocking in the round trip, most on the 00 plan).
 *   A1 ABSORBED  — a storey whose cut lies above the next plan storey's level has no plan; §STOREY_ABSORBED names it and the plan that takes it.
 *   A2 OPENINGS  — every door and window the model places on an absorbed or absorbing storey is an opening (§OPENING) of the absorbing plan; no plan of an absorbed storey is written.
 *   A3 READ      — the model-marked set reads with fewer blocking items than BASE's, and the codes that fall are the duplicate plan's (no_host, opening_unclassified).
 *   A4 OTHERS    — a building with no storey under 1.2 m to the next (Duplex, HHS, Clinic, LTU) writes byte-identical sheets to BASE's.
 * Usage: NODE_PATH=<dir with better-sqlite3> BASE=<old modeller dir> node modeller/tests/witness_dxf_storey_absorb.js <Node model .db> [<more .db>]
 */
'use strict';
const path = require('path'), crypto = require('crypto'), M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js'), SC = require(D + 'std2d_scopes.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js'));
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const dbs = process.argv.slice(2); if (!dbs.length) { say('MISSING input: a Node model .db (e.g. /tmp/db2/JKR2.db)'); process.exit(2); }
const BD = process.env.BASE ? path.join(process.env.BASE, 'dxf2bim') + '/' : null;
const set = (Sx, Mkx, Ix, q) => { const R = Sx.writeStdSet(q, 'X', {}), Dm = Mkx.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC, SCOPES: SC }, { set: 'X' }); return { R, Dm, read: () => Ix.convert(Ix.readSheets(Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] }))), {}) }; };
const codes = v => { const m = {}; (v ? v.blocking : []).forEach(b => { m[b.code] = (m[b.code] || 0) + 1; }); return m; };
dbs.forEach(db => {
  const name = path.basename(db, '.db'), con = new Database(db, { readonly: true }), q = s => con.prepare(s).all();
  const A = set(S, Mk, I, q), ab = A.R.log.filter(l => /^§STOREY_ABSORBED/.test(l)), g0 = A.R.model.storeys.find(s => s.name === A.R.model.grid_storey).elev, st = A.R.model.storeys.filter(s => s.elev >= g0).sort((a, b) => a.elev - b.elev);   // storeys a plan can have (at or above the grid storey)
  const close = st.filter((s, i) => st[i + 1] && s.elev + 1.2 > st[i + 1].elev + 1e-9);
  if (!close.length) {   // A4
    if (!BD) { say('INCONCLUSIVE A4[' + name + '] | no BASE given'); return; }
    const Bs = set(require(BD + 'std2d.js'), require(BD + 'std2d_marks.js'), null, q), same = Object.keys(A.Dm.files).length === Object.keys(Bs.Dm.files).length && Object.keys(A.Dm.files).every(n => A.Dm.files[n] === Bs.Dm.files[n]);
    check('A4[' + name + ']', 'no storey under 1.2 m to the next: every sheet byte-identical to BASE', same && !ab.length, `sheets=${Object.keys(A.Dm.files).length} absorbed=${ab.length}`); return; }
  const absorbed = ab.map(l => /storey='([^']+)'/.exec(l)[1]), into = ab.map(l => /into='([^']+)'/.exec(l)[1]), plans = A.R.views.plan.map(v => v.storey.name);
  check('A1[' + name + ']', 'a storey whose cut lies above the next level has no plan; the next plan absorbs it', ab.length >= 1 && absorbed.every(n => plans.indexOf(n) < 0) && into.every(n => plans.indexOf(n) >= 0), `${ab.join(' | ').slice(0, 260)} plans=${plans.join(',')}`);
  const want = A.R.model.els.filter(e => (e.cls === 'IfcDoor' || e.cls === 'IfcWindow') && (absorbed.indexOf(e.storey) >= 0 || into.indexOf(e.storey) >= 0)).map(e => e.guid);
  const drawn = new Set(A.R.log.filter(l => /^§OPENING /.test(l) && !/ pos=above /.test(l)).map(l => /guid=(\S+)/.exec(l)[1])), miss = want.filter(g => !drawn.has(g));
  const ovhd = new Set(A.R.log.filter(l => /^§OPENING /.test(l) && / pos=above /.test(l)).map(l => /guid=(\S+)/.exec(l)[1])), stated = new Set(A.R.log.filter(l => /^§GAP GAP:opening_host_not_cut /.test(l)).map(l => /guid=(\S+)/.exec(l)[1])), missNotAbove = miss.filter(g => !ovhd.has(g) && !stated.has(g));
  check('A2[' + name + ']', 'every door / window of the absorbed and absorbing storeys is an opening of a plan (cut, or drawn above the cut), or a listed gap (its host not cut)', missNotAbove.length === 0, `doors+windows=${want.length} cut=${want.length - miss.length} above_cut=${miss.filter(g => ovhd.has(g)).length} host_not_cut(listed)=${miss.filter(g => stated.has(g)).length} missing=${missNotAbove.length}`);
  if (BD) { const Bs = set(require(BD + 'std2d.js'), require(BD + 'std2d_marks.js'), require(path.join(process.env.BASE, 'dxf2bim_import.js')), q), v0 = Bs.read().verdict, v1 = A.read().verdict, c0 = codes(v0), c1 = codes(v1);
    const fell = Object.keys(c0).filter(k => (c1[k] || 0) < c0[k]).map(k => k.replace('GAP:', '') + ' ' + c0[k] + '->' + (c1[k] || 0)), rose = Object.keys(c1).filter(k => c1[k] > (c0[k] || 0)).map(k => k.replace('GAP:', '') + ' ' + (c0[k] || 0) + '->' + c1[k]);
    check('A3[' + name + ']', 'the model-marked set reads with fewer blocking items; the duplicate plan\'s codes fall, none rises', v1.blocking.length < v0.blocking.length && (c1['GAP:no_host'] || 0) < (c0['GAP:no_host'] || 0) && !rose.length, `blocking ${v0.blocking.length} -> ${v1.blocking.length} fell: ${fell.join(', ')} rose: ${rose.join(', ') || 'none'}`); }
  else say('INCONCLUSIVE A3[' + name + '] | no BASE given');
});
say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
