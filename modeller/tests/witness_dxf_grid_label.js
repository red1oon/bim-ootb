#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-GRID-LABEL (rule D48, prompts/DXF2BIM_FOUNDATION_LANE.md §D48). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: on the plain HHS set Accept all left 37 grid lines unread: the labels 10..14 (two characters) were not grid labels, and grids 40 / 49 mm apart with
 * staggered bubbles each saw their neighbour's label within the tolerance (refused as two candidates).
 *   G1 ALL READ   — the plain set through Accept all: every @GRIDX / @GRIDY / @GRIDH of the model's markings is accepted, same label, same position (0.01 units), 0 wrong.
 *   G2 UNCHANGED  — the raw shed (SHED_RAW_DIR) with BASE (an older modeller dir): its accepted grid markings equal BASE's; else INCONCLUSIVE.
 *   G3 FALSIFIER  — (a) a second label text placed exactly on a labelled grid line's axis at its end: a tie, the line refused (no grid marking for it); (b) a 4-character text there instead: ignored, the line keeps its label.
 * Usage: NODE_PATH=<dir with better-sqlite3> [SHED_RAW_DIR=<dir> BASE=<old modeller dir>] node modeller/tests/witness_dxf_grid_label.js <Node model .db> [<more .db>]
 */
'use strict';
const path = require('path'), crypto = require('crypto'), fs = require('fs'), os = require('os'), M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js'), SC = require(D + 'std2d_scopes.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), CLI = require(path.join(M, 'dxf2bim_cli.js'));
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const dbs = process.argv.slice(2); if (!dbs.length && !process.env.SHED_RAW_DIR) { say('MISSING input: a Node model .db (e.g. /tmp/db2/HHSM2.db)'); process.exit(2); }
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'w-grid-'));
const ARGS = { accept: true, set: null, level: null, layer: [], datum: [], haxis: [], bodyz: [], size: [], pack: [], default: [], choice: [], exclude: [], ifc: false, complete: false };
const accept = (dir, Cli) => { const files = fs.readdirSync(dir).filter(n => /\.dxf$/i.test(n)).sort().map(n => path.join(dir, n)); const r = (Cli || CLI).run(Object.assign({}, ARGS, { sheets: files, out: dir }), () => {}); const o = {}; r.sheets.forEach(sh => { o[sh.name] = sh.marks; }); return o; };
const G = m => /^GRID[XYH]$/.test(m.key), near = (a, b) => Math.abs(a - b) <= 0.01;
const addText = (t, text, x, y) => MK.writeMarks(t, [{ text, x, y }]).replace(new RegExp('(\\n8\\n)DXF2BIM-MARK(\\n10\\n' + String(x).replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '\\n20\\n' + String(y).replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '\\n30\\n0\\n40\\n1\\n1\\n' + text + ')'), '$1A-GRID$2');
dbs.forEach(db => {
  const name = path.basename(db, '.db'), con = new Database(db, { readonly: true }), q = s => con.prepare(s).all(), P = new DxfParser();
  const R = S.writeStdSet(q, 'X', {}), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC, SCOPES: SC }, { set: 'X' }), dir = path.join(TMP, name);
  fs.mkdirSync(dir); Object.keys(R.files).forEach(n => fs.writeFileSync(path.join(dir, n), R.files[n]));
  const got = accept(dir); let same = 0, wrong = [], miss = [];
  Object.keys(Dm.files).forEach(n => { MK.readMarks(P.parseSync(Dm.files[n]).entities).forEach(m => { const r = /^@(GRID[XYH])=(\S+)/.exec(m.raw); if (!r) return;
    const g = (got[n] || []).filter(x => x.key === r[1] && near(x.x, m.x) && near(x.y, m.y)); if (g.length === 1 && g[0].value === r[2]) same++; else if (g.length) wrong.push(n + ' @' + r[1] + '=' + r[2] + ' got ' + g.map(x => x.value).join('/')); else miss.push(n + ' @' + r[1] + '=' + r[2]); }); });
  check('G1[' + name + ']', 'every grid marking of the model is accepted from the plain set, same label and position', !wrong.length && !miss.length && same > 0, `same=${same} wrong=${wrong.length} missing=${miss.length} ${wrong.concat(miss).slice(0, 4).join(' | ')}`);
  // G3: on the first plan, the line of the first accepted GRIDX label; a second label text exactly on its axis at the label's height (a tie), then a 4-character text instead
  const plan = Object.keys(R.files).find(n => (got[n] || []).some(m => m.key === 'GRIDX')), gx = got[plan].filter(m => m.key === 'GRIDX')[0];
  const ents = P.parseSync(R.files[plan]).entities, lab = ents.find(e => (e.type === 'TEXT' || e.type === 'MTEXT') && String(e.text).trim() === gx.value && Math.abs((e.startPoint || e.position).x - gx.x) <= 0.01);
  const ly = (lab.startPoint || lab.position).y, tie = (lab.startPoint || lab.position).x;
  for (const [tag, text, expectRead] of [['a', gx.value === 'Z' ? 'Y' : 'Z', false], ['b', 'ABCD', true]]) {
    const fd = path.join(TMP, name + '_' + tag); fs.mkdirSync(fd); Object.keys(R.files).forEach(n => fs.writeFileSync(path.join(fd, n), n === plan ? addText(R.files[n], text, tie, ly) : R.files[n]));
    const g3 = accept(fd)[plan].filter(m => m.key === 'GRIDX' && near(m.x, gx.x));
    check('G3' + tag + '[' + name + ']', tag === 'a' ? 'a second label exactly on the axis (a tie): the line is refused' : 'a 4-character text is no grid label: the line keeps its own', expectRead ? (g3.length === 1 && g3[0].value === gx.value) : g3.length === 0, `line x=${gx.x} label=${gx.value} added="${text}" read=${JSON.stringify(g3.map(m => m.value))}`);
  }
});
if (process.env.SHED_RAW_DIR && process.env.BASE) {
  const raw = process.env.SHED_RAW_DIR, cp = path.join(TMP, 'shed'); fs.mkdirSync(cp); fs.readdirSync(raw).filter(n => /\.dxf$/i.test(n)).forEach(n => fs.copyFileSync(path.join(raw, n), path.join(cp, n)));
  const sig = o => JSON.stringify(Object.keys(o).sort().map(n => [n, o[n].filter(G).map(m => [m.key, m.value, m.x, m.y])]));
  const A = accept(cp), Bm = accept(cp, require(path.join(process.env.BASE, 'dxf2bim_cli.js')));
  check('G2[shed]', 'the raw shed\'s accepted grid markings equal BASE\'s', sig(A) === sig(Bm), `grids=${Object.values(A).reduce((n, a) => n + a.filter(G).length, 0)} base=${Object.values(Bm).reduce((n, a) => n + a.filter(G).length, 0)}`);
} else say('INCONCLUSIVE G2 | set SHED_RAW_DIR and BASE to compare the raw shed');
fs.rmSync(TMP, { recursive: true, force: true });
say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
