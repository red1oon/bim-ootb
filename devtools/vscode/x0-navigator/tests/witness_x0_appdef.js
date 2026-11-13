#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-X0-APPDEF (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.4 X0-1, issue #2920).
// Read the log after every run: exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "F12 on APP.x finds nothing, because the field is written as A.x" —
//   for a fixed sample of the REAL internal/APP_SURFACE.md, the place lib/app_surface_index.js returns must be a
//   source line that really mentions `.field`. A wrong jump is worse than none, so the three "never guess" cases
//   are red controls: phantom → no location · made-up field → nothing · index line shifted by one → `stale`.
// POPULATION: every 50th row of the `## All fields` table, sorted by name. A written field is judged at its
//   `written at` line; a phantom has no definition and is judged at its `first read site` line.
// rows=0 → INCONCLUSIVE, never PASS.
// Command: node devtools/vscode/x0-navigator/tests/witness_x0_appdef.js
'use strict';
const fs = require('fs');
const path = require('path');
const { Witness } = require('../../../../witness_kit/contract');
const S = require('../lib/app_surface_index');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const STEP = 50;
function summary(f, verdict) {
  console.log('§X0_APPDEF ' + Object.keys(f).map(k => k + '=' + f[k]).join(' ') + ' verdict=' + verdict);
}

const index = S.loadSurface(ROOT);
if (!index || index.rows === 0) {
  console.log('  no rows: ' + (index ? 'the `## All fields` table was not found (tables=' + index.tablesFound + ')' : 'internal/APP_SURFACE.md is missing'));
  summary({ rows: 0, sampled: 0, resolved: 0, line_matches: 0 }, 'INCONCLUSIVE');
  process.exit(0);
}

const srcLine = (file, line) => {
  try { return fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n')[line - 1]; } catch (e) { return undefined; }
};
// One judged row per sampled field: the site the provider would show, as plain data.
function judge(name) {
  const r = S.resolve(index, name);
  const site = r.kind === 'phantom' ? r.firstRead : { file: r.file, line: r.line };
  return { field: name, kind: r.kind, file: site ? site.file : '', line: site ? site.line : 0 };
}
const names = Array.from(index.fields.keys()).sort();
const sample = names.filter((_, i) => i % STEP === 0).map(judge);
const matches = rows => rows.filter(r => S.lineHasField(srcLine(r.file, r.line), r.field)).length;

const res = Witness('x0_appdef')
  .population(() => sample)
  .schema({
    type: 'object',
    required: ['field', 'kind', 'file', 'line'],
    properties: {
      field: { type: 'string', minLength: 1 }, kind: { enum: ['definition', 'phantom'] },
      file: { type: 'string', pattern: '\\.(js|mjs|html)$' }, line: { type: 'integer', minimum: 1 }
    }
  })
  .invariant('every sampled site line really mentions .field', rows => matches(rows) === rows.length)
  .invariant('a phantom never offers a definition', rows => rows.filter(r => r.kind === 'phantom')
    .every(r => { const x = S.resolve(index, r.field); return x.kind === 'phantom' && !x.abs; }))
  .redControl(rows => rows.map(r => Object.assign(r, { line: r.line + 1 })))
  .run();

let extraFail = 0;
function check(label, cond) { console.log('  ' + (cond ? 'PASS ' : 'FAIL ') + label); if (!cond) extraFail++; }

// Red controls on the three "never guess" cases.
const aPhantom = names.find(n => index.fields.get(n).phantom && !index.fields.get(n).untied);
const ph = aPhantom ? S.resolve(index, aPhantom) : null;
check('phantom APP.' + aPhantom + ' → hover says PHANTOM, no location',
  !!ph && ph.kind === 'phantom' && !ph.abs && /^\*\*APP\.[\w$]+\*\*\n\nPHANTOM — read, never written \(first read `/.test(S.formatHover(ph)));
// #2974: a phantom that has a same-named write the generator could not tie is NOT called dead: the hover says PHANTOM? and names that line
const anUntied = names.find(n => index.fields.get(n).untied);
if (!anUntied) console.log('  NOTE  no untied phantom in this index: the PHANTOM? hover is not judged here');
else {
  const u = S.resolve(index, anUntied), ut = S.formatHover(u) || '';
  const src = fs.readFileSync(path.join(ROOT, u.untied.file), 'utf8').split('\n')[u.untied.line - 1] || '';
  check('untied phantom APP.' + anUntied + ' → hover says "PHANTOM?" and names ' + u.untied.file + ':' + u.untied.line + ', a line that assigns that name; no jump',
    u.kind === 'phantom' && !u.abs && /PHANTOM\? — no writer the index can tie/.test(ut) && ut.includes(u.untied.file + ':' + u.untied.line) &&
    !/PHANTOM — read, never written/.test(ut) && new RegExp('\\.' + anUntied + '\\s*=').test(src));
}
check('made-up field zzNotAField__ → nothing at all', S.resolve(index, 'zzNotAField__') === null && S.formatHover(null) === null);
const aDef = sample.find(r => r.kind === 'definition');
const shifted = { root: ROOT, fields: new Map([[aDef.field, Object.assign({}, index.fields.get(aDef.field), { line: aDef.line + 1 })]]) };
const st = S.resolve(shifted, aDef.field);
const goodHover = S.formatHover(S.resolve(index, aDef.field));
check('index shifted by one line (APP.' + aDef.field + ') → stale, never a jump',
  st.kind === 'stale' && !st.abs && /index stale — hover again in a few seconds, or run "X0 Navigator: Rebuild indexes"/.test(S.formatHover(st)));
check('hover text: written at <file:line> · N writes · N reads',
  new RegExp('written at `' + aDef.file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':' + aDef.line + '` · \\d+ writes · \\d+ reads$').test(goodHover));

// The cursor rule: property of APP / A / app, with the generator's R5/R6 binding gate.
// The sample code is assembled from pieces on purpose: scripts/gen_app_surface.js reads string literals too, so a
// literal god-object access written here would enter the real index as a field (the R8 class of defect).
const G = 'AP' + 'P', DOT = '.';
const lineG = '  x = ' + G + DOT + 'camera.position;';
const bound = 'function setup' + 'Thing(' + 'A) {}';
check('cursor on the property → camera; on the object name → nothing',
  (S.fieldAt(lineG, 12, '') || {}).field === 'camera' && S.fieldAt(lineG, 7, '') === null);
check('window.<god object>.camera counts; other.<god object>.camera does not',
  (S.fieldAt('window.' + G + DOT + 'camera', 13, '') || {}).field === 'camera' && S.fieldAt('other.' + G + DOT + 'camera', 12, '') === null);
check('the bare one-letter spelling counts only in a file that binds it (R5)',
  (S.fieldAt('  A' + DOT + 'camera = 1;', 6, bound) || {}).field === 'camera' && S.fieldAt('  A' + DOT + 'camera = 1;', 6, 'var A' + ' = [];') === null);
check('the lowercase spelling counts only in a file that binds it (R6)',
  (S.fieldAt('app' + DOT + 'tm = 1;', 5, 'var ap' + 'p = window.' + G + ';') || {}).field === 'tm'
  && S.fieldAt('app' + DOT + 'tm = 1;', 5, 'const ap' + 'p = express();') === null);
const gen = fs.readFileSync(path.join(ROOT, 'scripts', 'gen_app_surface.js'), 'utf8');
check('the two binding gates are the generator\'s own, verbatim',
  gen.includes('const BINDS_A = ' + S.BINDS_A + ';') && gen.includes('const BINDS_app = ' + S.BINDS_app + ';'));

const selfRows = fs.readFileSync(index.file, 'utf8').split('\n').filter(l => l.includes('`devtools/')).length;
check('the extension\'s own files add no row to the index (n=' + selfRows + ')', selfRows === 0);

// Whole index, for information (not part of the verdict): how many written fields would be refused as stale today.
let allDef = 0, allStale = 0;
for (const n of names) { const r = S.resolve(index, n); if (r.kind === 'definition') allDef++; else if (r.kind === 'stale') allStale++; }
console.log('§X0_APPDEF_ALL rows=' + index.rows + ' fields=' + names.length + ' definition=' + allDef + ' stale=' + allStale
  + ' phantom=' + (names.length - allDef - allStale) + ' phantom_table=' + index.phantoms + ' untied=' + index.untied);

const resolved = sample.filter(r => r.kind === 'definition').length;
const lm = matches(sample);
const pass = res.fail === 0 && extraFail === 0 && lm === sample.length;
summary({ rows: index.rows, sampled: sample.length, resolved, phantoms: sample.length - resolved, line_matches: lm }, pass ? 'PASS' : 'FAIL');
if (!pass) process.exitCode = 1;
