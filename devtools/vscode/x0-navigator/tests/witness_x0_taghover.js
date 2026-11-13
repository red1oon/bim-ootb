#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS §DEVTK_SPEC (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.4 X0-2,
// bim-ootb prompts/DEV_TOOLKIT_NO_AI.md §5.3, issue #2920). Read the log after every run: exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "a §TAG in the code has no link to the rule it stands for" —
//   a tag known in bim-compiler prompts/4D_MODEL_INTEGRITY.md must resolve there (by file, not by line),
//   every place returned must really contain the tag, and a made-up tag must say "no spec found", never a guess.
// POPULATION: the spec places lib/tag_index.js returns for §HOSTED_BEFORE_HOST over the REAL prompts/docs of both repos.
// RED CONTROLS: (1) the same places with 4D_MODEL_INTEGRITY.md removed must fail (contract redControl);
//               (2) the made-up tag must not resolve; (3) a place shifted by one line must fail the "line contains tag" check.
// bim-compiler root not found → INCONCLUSIVE, never PASS.
// Command: node devtools/vscode/x0-navigator/tests/witness_x0_taghover.js [--compiler-root <dir>]
//   default compiler root: a sibling folder ../bim-compiler of this repo (never a hard-coded home path).
'use strict';
const fs = require('fs');
const path = require('path');
const { Witness } = require('../../../../witness_kit/contract');
const T = require('../lib/tag_index');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const ai = process.argv.indexOf('--compiler-root');
const COMPILER = ai > 0 ? path.resolve(process.argv[ai + 1]) : path.resolve(ROOT, '..', 'bim-compiler');
const KNOWN = '§HOSTED_BEFORE_HOST';
const KNOWN_FILE = 'prompts/4D_MODEL_INTEGRITY.md';
// a per-run suffix: the bare name is quoted in a spec file (bim-compiler CODE_ARCHITECTURE_DESIGN.md), so it stopped being made-up
const FAKE = '§ZZ_NOT_A_TAG_' + Date.now().toString(36).toUpperCase();

function summary(f, verdict) {
  console.log('§DEVTK_SPEC ' + Object.keys(f).map(k => k + '=' + f[k]).join(' ') + ' verdict=' + verdict);
}

if (!fs.existsSync(path.join(COMPILER, KNOWN_FILE))) {
  console.log('  bim-compiler root not usable: ' + COMPILER + ' (no ' + KNOWN_FILE + ')');
  summary({ tags: 0, files: 0, known_hit: 'N', fake_none: 'N' }, 'INCONCLUSIVE');
  process.exit(0);
}

const t0 = process.hrtime.bigint();
const index = T.buildIndex([{ name: 'bim-ootb', dir: ROOT }, { name: 'bim-compiler', dir: COMPILER }]);
const ms = Number((process.hrtime.bigint() - t0) / 1000000n);
console.log('§X0_TAG_INDEX spec_tags=' + index.spec.tags.size + ' spec_files=' + index.spec.files
  + ' printer_tags=' + index.printers.tags.size + ' js_files=' + index.printers.files
  + ' missing_roots=' + index.spec.missing.length + ' build_ms=' + ms);

const known = T.lookup(index, KNOWN);
const fake = T.lookup(index, FAKE);
const lineHasTag = (abs, line, tag) => {
  const l = fs.readFileSync(abs, 'utf8').split('\n')[line - 1];
  return typeof l === 'string' && T.tagsInLine(l).some(h => h.tag === tag);
};
const inKnownFile = r => r.root === 'bim-compiler' && r.file === KNOWN_FILE;

const res = Witness('x0_taghover')
  .population(() => known.spec)
  .schema({
    type: 'object',
    required: ['root', 'abs', 'file', 'line', 'heading', 'inHeading'],
    properties: {
      root: { enum: ['bim-ootb', 'bim-compiler'] }, abs: { type: 'string', minLength: 1 },
      file: { type: 'string', pattern: '^(prompts|docs)/.+\\.md$' }, line: { type: 'integer', minimum: 1 },
      heading: { type: 'string' }, inHeading: { type: 'boolean' }
    }
  })
  .invariant('known tag resolves to bim-compiler ' + KNOWN_FILE, rows => rows.some(inKnownFile))
  .invariant('every spec place really contains the tag', rows => rows.every(r => lineHasTag(r.abs, r.line, KNOWN)))
  .invariant('heading places sort first', rows => {
    const firstPlain = rows.findIndex(r => !r.inHeading);
    return firstPlain < 0 || rows.slice(firstPlain).every(r => !r.inHeading);
  })
  .redControl(rows => rows.filter(r => !inKnownFile(r)))
  .run();

// Checks outside the row contract: each prints PASS/FAIL and counts toward the verdict.
let extraFail = 0;
function check(label, cond) { console.log('  ' + (cond ? 'PASS ' : 'FAIL ') + label); if (!cond) extraFail++; }

const fakeHover = T.formatHover(fake);
const fakeNone = !fake.found && fake.spec.length === 0 && /no spec found/.test(fakeHover);
check('made-up tag ' + FAKE + ' → "no spec found" (never a guess)', fakeNone);
check('red control: the known tag does NOT say "no spec found"', known.found && !/no spec found/.test(T.formatHover(known)));
check('red control: the same places shifted by one line fail the line check',
  known.spec.length > 0 && !known.spec.every(r => lineHasTag(r.abs, r.line + 1, KNOWN)));
check('printed by: ≥1 .js line, each really contains the tag (n=' + known.printers.length + ')',
  known.printers.length > 0 && known.printers.every(p => lineHasTag(p.abs, p.line, KNOWN)));
check('hover shows at most ' + T.SHOWN + ' spec places and ' + T.SHOWN + ' printers',
  (T.formatHover(known).match(/^- (?!…)/gm) || []).length <= 2 * T.SHOWN);
check('tagAt finds the tag under the cursor and nothing beside it',
  T.tagAt("  console.log('" + KNOWN + " n=' + n);", 20) === KNOWN && T.tagAt("  console.log('" + KNOWN + "');", 3) === null);

console.log('--- hover text for ' + KNOWN + ' ---');
console.log(T.formatHover(known));
console.log('--- hover text for ' + FAKE + ' ---');
console.log(fakeHover);

const knownHit = known.spec.some(inKnownFile);
const pass = res.fail === 0 && extraFail === 0 && knownHit && fakeNone;
summary({ tags: index.spec.tags.size, files: index.spec.files, known_hit: knownHit ? 'Y' : 'N', fake_none: fakeNone ? 'Y' : 'N' },
  pass ? 'PASS' : 'FAIL');
if (!pass) process.exitCode = 1;
