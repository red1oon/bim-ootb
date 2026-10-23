#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-TYPE-TIE (rule D73, prompts/DXF2BIM_FOUNDATION_LANE.md §D73). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: a size the library answers with several types (Duplex 819 x 759: SMALL_FIXED, CASEMENT) left every such fill unbound (blocking GAP:fill_unbound).
 *   T1 DEFAULT  — bindTypes with tie 'library_first': the library's first row binds (size_default) + one advisory GAP:type_defaulted; tie absent/'none' = unbound exactly as before.
 *   T2 WINS     — one candidate / explicit binding keep their bind_source and get no type_defaulted.
 *   T3 PAGE     — Duplex standard set with NO @EXCLUDE (4 stacked clusters read), with the library (OCI; unreachable -> INCONCLUSIVE): fill_unbound 12 -> 0, 12 bound to the first row, the walls' bindings unchanged; @DEFAULT=type.size_tie,none gives 12 again.
 *   T4 TABLE    — the defaults table lists type.size_tie (guess, default).
 * Usage: NODE_PATH=<dir with better-sqlite3> node modeller/tests/witness_dxf_type_tie.js <Duplex Node model .db>
 */
'use strict';
const path = require('path'), crypto = require('crypto'), M = path.join(__dirname, '..'), hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
let fail = 0, judged = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { judged++; if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const D = path.join(M, 'dxf2bim') + '/', T = require(D + 'dxf2types.js');
const N = { S: require(D + 'std2d.js'), Mk: require(D + 'std2d_marks.js'), MK: require(D + 'dxf2marks.js'), B: require(D + 'dxf2bim.js'), SHC: require(D + 'dxf2shell_config.js'), SC: require(D + 'std2d_scopes.js'),
  DxfParser: require(path.join(M, 'lib/dxf-parser.js')), I: require(path.join(M, 'dxf2bim_import.js')) };
const win = (h, w, ht) => ({ op_type: 'DXF_OPENING', output_guid: 'g' + h, input_guids: [], params: { kind: 'window', category: 'window', handle: h, width: w, height: ht } });
const LIB = { window: [{ id: 'A_FIXED', set: 'S1', width: .819, height: .759 }, { id: 'B_CASE', set: 'S1', width: .819, height: .759 }, { id: 'C_BIG', set: 'S1', width: 2, height: 1 }], wall: [], door: [] };
const run = (ops, tie, o) => T.bindTypes(ops, LIB, { bind: { size_tol: .005, prefer: ['S1'], tie } }, o || {}).ops;
const typeOf = (ops, h) => (ops.find(o => o.op_type === 'DXF_OPENING' && o.params.handle === h).params.type || {}).type_id || null;
const gaps = (ops, c) => ops.filter(o => o.op_type === 'DXF_GAP' && o.params.code === c);
(async () => {
  const ops = [win('w1', .819, .759), win('w2', 2, 1)];
  const a = run(ops, 'library_first'), b = run(ops, undefined), c = run(ops, 'none');
  const tg = gaps(a, 'GAP:type_defaulted')[0], p1 = a.find(o => o.params.handle === 'w1').params.type;
  check('T1', 'tie=library_first binds the first library row (size_default) with one type_defaulted advisory; absent/none = unbound as before', typeOf(a, 'w1') === 'A_FIXED' && p1.bind_source === 'size_default' && gaps(a, 'GAP:type_defaulted').length === 1 && tg.params.candidates.join() === 'A_FIXED,B_CASE' && typeOf(b, 'w1') === null && gaps(b, 'GAP:type_unbound').length === 1 && gaps(b, 'GAP:type_defaulted').length === 0 && JSON.stringify(b) === JSON.stringify(c),
    `bound=${typeOf(a, 'w1')} src=${p1.bind_source} advisory=${gaps(a, 'GAP:type_defaulted').length} untied_unbound=${gaps(b, 'GAP:type_unbound').length} none==absent:${JSON.stringify(b) === JSON.stringify(c)}`);
  const one = a.find(o => o.params.handle === 'w2').params.type, ex = run(ops, 'library_first', { bindings: [{ select: { handle: 'w1' }, type_id: 'B_CASE' }] });
  check('T2', 'one candidate keeps bind_source size; an explicit binding wins over the default and raises no type_defaulted', one.bind_source === 'size' && typeOf(ex, 'w1') === 'B_CASE' && ex.find(o => o.params.handle === 'w1').params.type.bind_source === 'explicit' && gaps(ex, 'GAP:type_defaulted').length === 0,
    `w2=${one.bind_source} explicit=${typeOf(ex, 'w1')} advisories=${gaps(ex, 'GAP:type_defaulted').length}`);
  const ref = JSON.parse(require('fs').readFileSync(path.join(M, 'element_defaults.json'), 'utf8')).defaults['type.size_tie'];
  check('T4', 'element_defaults.json carries type.size_tie = library_first, kind guess', !!ref && ref.value === 'library_first' && ref.kind === 'guess', JSON.stringify(ref && [ref.value, ref.kind]));
  const db = process.argv[2];
  if (!db) say('INCONCLUSIVE T3 | no Duplex Node model .db given (/tmp/db2/DXARC.db): nothing judged');
  else {
    const con = new Database(db, { readonly: true }), q = s => con.prepare(s).all(), R = N.S.writeStdSet(q, 'DX', {}), Dm = N.Mk.deriveMarks(R, { B: N.B, DxfParser: N.DxfParser, hashHex, MK: N.MK, SHC: N.SHC, SCOPES: N.SC }, { set: 'DX' });
    const plain = Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] })), S0 = N.I.readSheets(plain);
    let lib = null; try { lib = (await N.I.loadOci(S0, { fetchJson: async u => (await fetch(u)).json(), base: 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/dxf2bim/library/' })).library; } catch (e) { say('  (library: ' + e.message + ')'); }
    if (!lib) say('INCONCLUSIVE T3 | no library reachable: nothing judged');
    else {
      const fu = v => v.blocking.filter(x => x.code === 'GAP:fill_unbound').length, wu = v => v.advisory.filter(x => x.code === 'GAP:type_unbound' && (x.detail || {}).class === 'wall').length, off = N.I.convert(N.I.readSheets(plain.map(F => /FLOOR/.test(F.name) ? { name: F.name, text: N.MK.writeMarks(F.text.replace(/\0/g, ''), [{ text: '@DEFAULT=type.size_tie,none @BY=user', x: 0, y: 0 }].concat(N.MK.readMarks(new N.DxfParser().parseSync(F.text).entities).map(m => ({ text: m.raw, x: m.x, y: m.y })))) } : F)), { library: lib }).verdict;
      const on = N.I.convert(S0, { library: lib }).verdict, adv = on.advisory.filter(x => x.code === 'GAP:type_defaulted').length;
      check('T3', 'Duplex standard set without @EXCLUDE: fill_unbound 12 -> 0 with the default, 12 again with @DEFAULT=type.size_tie,none', fu(off) === 12 && fu(on) === 0 && adv === 12 && wu(off) === wu(on) && wu(on) > 0, `wall type_unbound off=${wu(off)} on=${wu(on)} unbound off=${fu(off)} on=${fu(on)} type_defaulted advisories=${adv} verdict=${on.verdict}`);
    }
  }
  say('SUMMARY fail=' + fail + ' judged=' + judged); process.exit(fail ? 1 : 0);
})().catch(e => { say('FATAL ' + e.stack); process.exit(1); });
