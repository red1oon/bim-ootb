#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-X0-CONTEXT (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.16, issue #2965).
// Read the log after every run: exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "the context block handed to an assistant says something the indexes do not, or stays
//   silent where it should say 'none'" — every section must equal the owning lib's own answer, and a file with nothing to
//   report must say so in words.
// POPULATION: (1) a temp git repo with a page, a service worker, a file that has a header and prints three tags, and a log
//   written by the repo's REAL scripts/log_stamp.js; (2) real files of this checkout, each section compared with the lib.
// RED CONTROLS: a bare file (no header, no tag, not loaded) → "no header comment", "prints no § tag", "not loaded at
//   start", "none"; a file that does not exist → "no such file", found=false; the same fixture with its log unstamped →
//   every tag says "no stamped log found" (never a value).
// git or the parser not usable → INCONCLUSIVE, never PASS.
// Command: node devtools/vscode/x0-navigator/tests/witness_x0_context.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const C = require('../lib/file_context');
const L = require('../lib/lens_index');
const T = require('../lib/tag_index');
const S = require('../lib/app_surface_index');
const D = require('../lib/deploy_cost');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const { stampLine } = require(path.join(ROOT, 'scripts', 'log_stamp.js'));
const SEC = '§';
let fail = 0;
function check(label, cond) { console.log('  ' + (cond ? 'PASS ' : 'FAIL ') + label); if (!cond) fail++; return !!cond; }
function summary(f, verdict) { console.log(SEC + 'X0_CONTEXT ' + Object.keys(f).map(k => k + '=' + f[k]).join(' ') + ' verdict=' + verdict); }
const yn = b => (b ? 'Y' : 'N');
const section = (text, title) => { const m = new RegExp('## ' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n\\n([\\s\\S]*?)(?=\\n## |$)').exec(text); return m ? m[1].trim() : null; };

// ── 1. fixture repo ──
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'x0-context-'));
const g = a => cp.spawnSync('git', a, { cwd: TMP, encoding: 'utf8' });
if (g(['init', '-q']).status !== 0) { summary({ git: 'N' }, 'INCONCLUSIVE'); process.exit(0); }
const commit = m => { g(['add', '-A']); g(['-c', 'user.name=w', '-c', 'user.email=w@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', m]); };
// the fixture source is assembled so this witness file itself prints no such tag
const TAG_A = SEC + 'CTX_PROBE_A', TAG_B = SEC + 'CTX_PROBE_B', TAG_C = SEC + 'CTX_PROBE_C';
// the shared-object name is assembled too: written out, the generator would index this witness's fixture as a real field
const OBJ = 'A', W = OBJ + '.ctxField';
const code = ['#!/usr/bin/env node', '// Copyright (c) someone', '// SPDX-License-Identifier: MIT', '// code.js: the fixture header, line one', '// line two of the header', "'use strict';",
  'function setupCode(' + OBJ + ') {', '  ' + W + ' = 1;', "  console.log('" + TAG_A + " n=' + " + W + ');', "  console.log('" + TAG_B + " ok');", "  console.log('" + TAG_C + " never logged');", '}', ''].join('\n');
fs.mkdirSync(path.join(TMP, 'app')); fs.mkdirSync(path.join(TMP, 'logs')); fs.mkdirSync(path.join(TMP, 'internal'));
fs.writeFileSync(path.join(TMP, 'app', 'code.js'), code);
fs.writeFileSync(path.join(TMP, 'app', 'bare.js'), 'var bare = 1;\n');
fs.writeFileSync(path.join(TMP, 'app', 'index.html'), '<html><body><script src="code.js?v=1"></script></body></html>\n');
fs.writeFileSync(path.join(TMP, 'app', 'sw.js'), "const CACHE_VERSION = 'v1';\nconst PRECACHE_ASSETS = [\n  'index.html',\n  'code.js',\n];\n");
fs.writeFileSync(path.join(TMP, '.gitignore'), 'logs/\n');
// the field index, made by the repo's REAL generator on the fixture
const gen = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'gen_app_surface.js')], { encoding: 'utf8', env: Object.assign({}, process.env, { APPSURF_ROOT: TMP, APPSURF_OUT: path.join(TMP, 'internal') }) });
commit('one');
const body = [TAG_A + ' n=1', TAG_A + ' n=7', TAG_B + ' ok', ''].join('\n');
const fields = () => S.loadSurface(TMP);
const tagIndex = () => T.buildIndex([{ name: 'fixture', dir: TMP }]);
const ctx = rel => C.build(TMP, rel, { fields: fields(), tagIndex: tagIndex() });
require('../lib/js_facts').loadTs(ROOT);          // the repo's own parser finder, loaded once: the fixture then measures as the real repo does
const parser = !!D.measure(TMP, D.fsReader(TMP)).parser;
if (gen.status !== 0 || !fields()) { console.log('  NOTE  the generator did not run on the fixture: ' + (gen.stderr || '').split('\n')[0]); }

// RED CONTROL: the log without a stamp → no value for any tag
fs.writeFileSync(path.join(TMP, 'logs', 'run.log'), body);
const r0 = ctx('app/code.js');
const unstampedOk = check('red control: an unstamped log → all 3 tags say "no stamped log found", no value quoted',
  r0.facts.tagStates.join(',') === 'absent,absent,absent' && (r0.text.match(/not shown: no stamped log found/g) || []).length === 3 && !/n=7/.test(r0.text));

// stamped, file unchanged
fs.writeFileSync(path.join(TMP, 'logs', 'run.log'), stampLine(TMP, 'fixture') + '\n' + body);
const r1 = ctx('app/code.js');
console.log(r1.text.split('\n').map(l => '    | ' + l).join('\n'));
const hdr = section(r1.text, 'Its own header') || '';
const headerOk = check('header: the two comment lines, verbatim; the shebang, licence lines and code are not in it',
  r1.facts.headerLines === 2 && /\/\/ code\.js: the fixture header, line one\n\/\/ line two of the header/.test(hdr) && !/Copyright|SPDX|use strict|#!/.test(hdr));
const libLoad = D.fileClass(D.measure(TMP, D.fsReader(TMP)), 'app/code.js').map(x => x.app + ':' + x.how).join(',');
const loadOk = !parser ? null : check('load: equals deploy_cost.fileClass (' + libLoad + '), and names the bump command',
  r1.facts.load.join(',') === libLoad && libLoad === 'app:start-up' && /node scripts\/bump\.js app\/code\.js/.test(section(r1.text, 'How it reaches a user')));
const fieldOk = check('fields: the one field the real generator indexed in this file (' + (r1.facts.fields || []).join(',') + '), with its line',
  !!r1.facts.fields && r1.facts.fields.join(',') === 'ctxField' && /`APP\.ctxField` — line 8 \(written as `A\.ctxField`\)/.test(r1.text));
const lib1 = L.explain(TMP, 'app/code.js', code, L.scanLogs(path.join(TMP, 'logs')), new Map());
const tagsOk = check('tags: the 3 printed tags, in order, with lens_index.explain\'s states (' + r1.facts.tagStates.join(',') + '): last value of A is n=7, C is "tag not in any stamped log"',
  r1.facts.tags.join(',') === [TAG_A, TAG_B, TAG_C].join(',') && r1.facts.tagStates.join(',') === lib1.map(x => x.state).join(',') && r1.facts.tagStates.join(',') === 'shown,shown,absent' &&
  r1.text.includes('last value: `' + TAG_A + ' n=7` [run.log:3 @ ') && r1.text.includes('not shown: tag not in any stamped log') && (r1.text.match(/spec: no spec found/g) || []).length === 3);

// the file edited after the log → the reason, not the value
fs.writeFileSync(path.join(TMP, 'app', 'code.js'), code.replace('  ' + W + ' = 1;', '  ' + W + ' = 2;'));
const r2 = ctx('app/code.js');
const changedOk = check('the file edited after the log → "file changed since the log" twice, no value, and the block says the file has uncommitted changes',
  r2.facts.tagStates.join(',') === 'hidden,hidden,absent' && (r2.text.match(/not shown: file changed since the log/g) || []).length === 2 && !/n=7/.test(r2.text) && /this file has uncommitted changes/.test(r2.text));

// RED CONTROLS: nothing to say is said in words; a missing file is not invented
const rb = ctx('app/bare.js');
const emptyOk = check('red control: a bare file → "no header comment", "not loaded at start", "none", "prints no § tag"',
  /no header comment/.test(section(rb.text, 'Its own header')) && (parser ? /^not loaded at start/.test(section(rb.text, 'How it reaches a user')) : true) &&
  section(rb.text, 'APP fields whose listed write site is this file') === 'none' && section(rb.text, 'The § tags it prints') === 'prints no § tag');
const rm = ctx('app/missing.js');
const missingOk = check('red control: a file that does not exist → found=false and "no such file"', rm.found === false && /no such file/.test(rm.text));
const rn = C.build(TMP, 'app/code.js', { fields: null, tagIndex: null });
const noIndexOk = check('no indexes handed in → those sections say INCONCLUSIVE / not available, never a made-up answer',
  /INCONCLUSIVE: no APP field index/.test(rn.text) && /spec: spec index not available/.test(rn.text));
fs.rmSync(TMP, { recursive: true, force: true });

// ── 2. real files of this checkout: each section against the owning lib ──
const realFields = S.loadSurface(ROOT);
const realTags = T.buildIndex([{ name: 'bim-ootb', dir: ROOT }]);
const realCost = D.measure(ROOT, D.fsReader(ROOT));
const REAL = ['viewer/cost_panel.js', 'viewer/city.js', 'viewer/grid_overlay.js', 'viewer/schedule_gate.js', 'erp/ad_callout.js', 'scripts/bump.js'].filter(f => fs.existsSync(path.join(ROOT, f)));
let realOk = 0;
for (const rel of REAL) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const r = C.build(ROOT, rel, { fields: realFields, tagIndex: realTags, costNow: realCost });
  const wantLoad = realCost.parser ? D.fileClass(realCost, rel).map(x => x.app + ':' + x.how).join(',') : null;
  const wantFields = realFields ? [...realFields.fields.values()].filter(f => !f.phantom && f.file === rel).length : null;
  const wantTags = L.explain(ROOT, rel, text, L.scanLogs(path.join(ROOT, 'logs')), new Map());
  const same = (wantLoad === null || r.facts.load.join(',') === wantLoad) && (wantFields === null || r.facts.fields.length === wantFields) &&
    r.facts.tags.join(',') === wantTags.map(x => x.tag).join(',') && r.facts.tagStates.join(',') === wantTags.map(x => x.state).join(',') &&
    r.facts.headerLines === C.headerOf(text).total && r.facts.tags.every(t => r.text.includes('`' + t + '`'));
  console.log('  ' + SEC + 'X0_CONTEXT_REAL file=' + rel + ' header_lines=' + r.facts.headerLines + ' load=' + (r.facts.load ? r.facts.load.join('+') || 'not-at-start' : '?') +
    ' fields=' + (r.facts.fields ? r.facts.fields.length : '?') + ' tags=' + r.facts.tags.length + ' shown=' + r.facts.tagStates.filter(s => s === 'shown').length + ' same_as_lib=' + yn(same));
  if (same) realOk++;
}
const cityFields = REAL.includes('viewer/city.js') ? C.build(ROOT, 'viewer/city.js', { fields: realFields, tagIndex: realTags, costNow: realCost }).facts.fields : null;
const realAllOk = check('real files: ' + realOk + ' of ' + REAL.length + ' blocks equal the libs\' own answers, section by section; viewer/city.js lists fields (' + (cityFields ? cityFields.length : '?') + ', db among them)',
  REAL.length >= 3 && realOk === REAL.length && !!cityFields && cityFields.length > 0 && cityFields.includes('db'));

const f = { header: yn(headerOk), load: loadOk === null ? '?' : yn(loadOk), fields: yn(fieldOk), tags: yn(tagsOk), changed_hidden: yn(changedOk), unstamped_no_value: yn(unstampedOk),
  empty_says_none: yn(emptyOk), missing_file: yn(missingOk), no_index_inconclusive: yn(noIndexOk), real_files: REAL.length, real_same: realOk };
summary(f, fail ? 'FAIL' : (parser && REAL.length >= 3 ? 'PASS' : 'INCONCLUSIVE'));
if (fail) process.exitCode = 1;
