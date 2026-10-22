#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-TITLE (rule D46, prompts/DXF2BIM_FOUNDATION_LANE.md §D46). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: our own plain standard sets were refused (8 of 9 HHS sheets had no role: their titles end in "1:100"), Accept all then wrote @LEVEL=0 on the plans and took a
 * grid bubble for the section cut, and the user typed 19 values (HHS) that the sheets already state: "(FFL +3.800)", "T/ROOF +10.695", "AT X=-8682.15".
 *   T1 ROLES     — the plain set (no markings) through Accept all alone (the CLI's own run): every sheet has @VIEW.
 *   T2 READ      — the accepted @VIEW / @LEVEL / @ROOF / @CUT equal the model's markings on every sheet that carries them; 0 wrong.
 *   T3 FALSIFIER — (a) a plan title with no level: no @LEVEL and the 0 default refused (the title names a storey); (b) an elevation with two different T/ROOF texts: no @ROOF, refused with the reason;
 *                  (c) a plan with a second title text "KEY PLAN": its role refused (two titles disagree).
 *   T4 UNCHANGED — with SHED_RAW_DIR (the raw shed, private) and BASE (an older modeller dir): every accepted marking equals BASE's (titles of other forms read as before); else INCONCLUSIVE.
 * Usage: NODE_PATH=<dir with better-sqlite3> [SHED_RAW_DIR=<dir>] [BASE=<old modeller dir>] node modeller/tests/witness_dxf_title.js <Node model .db> [<more .db>]
 */
'use strict';
const path = require('path'), crypto = require('crypto'), fs = require('fs'), os = require('os'), M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js'), SC = require(D + 'std2d_scopes.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), CLI = require(path.join(M, 'dxf2bim_cli.js'));
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const dbs = process.argv.slice(2); if (!dbs.length && !process.env.SHED_RAW_DIR) { say('MISSING input: a Node model .db (e.g. /tmp/db2/HHSM2.db)'); process.exit(2); }
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'w-title-'));
const ARGS = { accept: true, set: null, level: null, layer: [], datum: [], haxis: [], bodyz: [], size: [], pack: [], default: [], choice: [], exclude: [], ifc: false, complete: false };
const accept = (dir, Cli) => { const files = fs.readdirSync(dir).filter(n => /\.dxf$/i.test(n)).sort().map(n => path.join(dir, n)); const res = (Cli || CLI).run(Object.assign({}, ARGS, { sheets: files, out: dir }), () => {});
  const by = {}; res.sheets.forEach(sh => { by[sh.name] = sh.marks; }); return by; };
const get = (ms, k) => (ms || []).filter(m => m.key === k).map(m => m.value);
const KEYS = ['VIEW', 'LEVEL', 'ROOF', 'CUT'];
const eq = (a, b) => a === b || (a.split(',').length === b.split(',').length && a.split(',').every((x, i) => x === b.split(',')[i] || Math.abs(+x - +b.split(',')[i]) <= 0.01));
dbs.forEach(db => {
  const name = path.basename(db, '.db'), con = new Database(db, { readonly: true }), q = s => con.prepare(s).all();
  const R = S.writeStdSet(q, 'X', {}), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC, SCOPES: SC }, { set: 'X' }), dir = path.join(TMP, name);
  fs.mkdirSync(dir); Object.keys(R.files).forEach(n => fs.writeFileSync(path.join(dir, n), R.files[n]));
  const got = accept(dir), P = new DxfParser(), key = {};
  Object.keys(Dm.files).forEach(n => { key[n] = MK.readMarks(P.parseSync(Dm.files[n]).entities).map(m => { const r = /^@([A-Z]+)=(.*?)(?:\s+@BY=\S+)?$/.exec(m.raw); return { key: r[1], value: r[2] }; }); });
  const noRole = Object.keys(R.files).filter(n => !get(got[n], 'VIEW').length);
  check('T1[' + name + ']', 'every plain sheet gets its role from Accept all alone', !noRole.length, `sheets=${Object.keys(R.files).length} without_role=${noRole.length} ${noRole.join(' ')}`);
  let same = 0, wrong = [], miss = [];
  Object.keys(key).forEach(n => KEYS.forEach(k => { const want = get(key[n], k); if (!want.length) return; const have = get(got[n], k);
    if (have.length === 1 && eq(have[0], want[0])) same++; else if (have.length) wrong.push(n + ' @' + k + ' model=' + want[0] + ' got=' + have.join('/')); else miss.push(n + ' @' + k); }));
  check('T2[' + name + ']', 'the accepted VIEW / LEVEL / ROOF / CUT equal the model\'s on every sheet that has them, 0 wrong', !wrong.length && !miss.length, `same=${same} wrong=${wrong.length} missing=${miss.length} ${wrong.concat(miss).slice(0, 4).join(' | ')}`);
  // T3 falsifiers on edited copies of the same plain sheets
  const plan = Object.keys(R.files).find(n => /_FLOOR_.*_2_std\.dxf$|_FLOOR_LEVEL_2_std\.dxf$/.test(n)) || Object.keys(R.files).find(n => /_FLOOR_/.test(n)), elev = Object.keys(R.files).find(n => /_FRONT_std\.dxf$/.test(n));
  const f3 = path.join(TMP, name + '_f'); fs.mkdirSync(f3); Object.keys(R.files).forEach(n => fs.writeFileSync(path.join(f3, n), R.files[n]));
  const pt = R.files[plan], m = /\n1\n([^\n]*PLAN \(FFL [+-][\d.]+\)[^\n]*)\n/.exec(pt);
  if (m) fs.writeFileSync(path.join(f3, plan), pt.replace(m[1], m[1].replace(/\s*\(FFL [+-][\d.]+\)/, '')));
  const et = R.files[elev], r1 = /\n1\n(T\/ROOF [+-][\d.]+)\n/.exec(et);
  if (r1) { const add = MK.writeMarks(et, [{ text: 'T/ROOF +99.999', x: 0, y: 0 }]).replace(/(\n8\n)DXF2BIM-MARK(\n10\n0\n20\n0\n30\n0\n40\n1\n1\nT\/ROOF \+99\.999)/, '$1A-ANNO-NOTE$2'); fs.writeFileSync(path.join(f3, elev), add); }
  const g3 = accept(f3), lvl = get(g3[plan], 'LEVEL'), roofs = get(g3[elev], 'ROOF');
  check('T3a[' + name + ']', 'a plan title with no level gives no @LEVEL (and no 0 default: the title names a storey)', !!m && lvl.length === 0, `title="${m && m[1].replace(/\s*\(FFL [+-][\d.]+\)/, '')}" level=${JSON.stringify(lvl)}`);
  check('T3b[' + name + ']', 'two different T/ROOF texts on one elevation give no @ROOF', !!r1 && roofs.length === 0, `roof=${JSON.stringify(roofs)} first="${r1 && r1[1]}" second="T/ROOF +99.999"`);
  const f4 = path.join(TMP, name + '_k'); fs.mkdirSync(f4); Object.keys(R.files).forEach(n => fs.writeFileSync(path.join(f4, n), R.files[n]));
  fs.writeFileSync(path.join(f4, plan), MK.writeMarks(R.files[plan], [{ text: 'KEY PLAN', x: 0, y: 0 }]).replace(/(\n8\n)DXF2BIM-MARK(\n10\n0\n20\n0\n30\n0\n40\n1\n1\nKEY PLAN)/, '$1A-ANNO-NOTE$2'));
  const g4 = accept(f4);
  check('T3c[' + name + ']', 'a second title text on a plan ("KEY PLAN") refuses its role', get(g4[plan], 'VIEW').length === 0, `view=${JSON.stringify(get(g4[plan], 'VIEW'))}`);
});
if (process.env.SHED_RAW_DIR && process.env.BASE) {
  const raw = process.env.SHED_RAW_DIR, cp = path.join(TMP, 'shed'); fs.mkdirSync(cp); fs.readdirSync(raw).filter(n => /\.dxf$/i.test(n)).forEach(n => fs.copyFileSync(path.join(raw, n), path.join(cp, n)));
  const A = accept(cp), Bm = accept(cp, require(path.join(process.env.BASE, 'dxf2bim_cli.js'))), sig = o => JSON.stringify(Object.keys(o).sort().map(n => [n, o[n].map(m => [m.key, m.value, m.x, m.y])]));
  check('T4[shed]', 'the raw shed\'s accepted markings equal BASE\'s (its titles are of the old form)', sig(A) === sig(Bm), `sheets=${Object.keys(A).length} marks=${Object.values(A).reduce((n, a) => n + a.length, 0)} base=${Object.values(Bm).reduce((n, a) => n + a.length, 0)}`);
} else say('INCONCLUSIVE T4 | set SHED_RAW_DIR (the raw shed) and BASE (an older modeller dir) to compare');
fs.rmSync(TMP, { recursive: true, force: true });
say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
