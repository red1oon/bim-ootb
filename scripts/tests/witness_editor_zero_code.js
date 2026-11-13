#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-EDITOR-ZERO-CODE (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.0 Z1–Z3, bim-ootb #2918)
// Three dev-side editor files, one § line per check. Each line names the issue it proves or disproves:
//   Z1 §EZC_WORKSPACE  "search and F12 cannot cross the two repos"       — bim.code-workspace resolves both checkouts
//   Z2 §EZC_MATCHER    "a failing witness is not clickable in Problems"  — the task's OWN command + OWN matcher regexes,
//                                                                          run on 3 fixture witnesses in a temp folder
//   Z3 §EZC_SNIPPET    "a new witness starts without the contract, or can PASS unedited" — the snippet expanded with its
//                                                                          defaults and RUN against the real witness_kit
//   Z4 §EZC_LOG_SNIPPETS "a hand-typed log line or header drifts from the § and DO NOT REMOVE conventions" — `slog`
//                                                                          expanded and RUN; `spec` expanded and read (§F.0 Z4, #2962)
// Every check has a red control. A check that judged nothing prints INCONCLUSIVE, never PASS.
// Everything is read from the committed files (tasks.json, bim.code-workspace, witness.code-snippets): nothing is re-typed here.
// Usage: node scripts/tests/witness_editor_zero_code.js [--layout-root <dir>]
//   --layout-root: where the workspace file is taken to live when resolving its folders (default: this repo). Use it
//   from a /tmp worktree to test against the standard layout (bim-ootb next to bim-compiler).
// Final line: §EZC verdict=PASS|FAIL|INCONCLUSIVE. Exit 1 on FAIL. Read the log.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const ai = process.argv.indexOf('--layout-root');
const LAYOUT = ai > 0 ? path.resolve(process.argv[ai + 1]) : ROOT;

// The three files are JSON with full-line // comments only (that is how they are written). Strip those, then JSON.parse.
function readJsonc(file) {
  const txt = fs.readFileSync(file, 'utf8');
  return JSON.parse(txt.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n'));
}
const verdicts = [];
function line(tag, fields, verdict) {
  verdicts.push(verdict);
  console.log(tag + ' ' + Object.keys(fields).map(k => k + '=' + fields[k]).join(' ') + ' verdict=' + verdict);
}

// A missing or unreadable file is that check's FAIL (the defect is "the file is not there"), never a crash.
function guard(tag, fn) {
  try { fn(); } catch (e) { line(tag, { error: JSON.stringify(String(e.message).slice(0, 120)) }, 'FAIL'); }
}

// ── Z1 workspace ─────────────────────────────────────────────────────────────────────────────────────
const EXPECT = { 'bim-ootb': /red1oon\/bim-ootb(\.git)?$/i, 'bim-compiler': /red1oon\/BIMCompiler(\.git)?$/i };
function resolveFolders(ws, base) {
  return ws.folders.map(f => {
    const dir = path.resolve(base, f.path);
    let origin = '';
    try { origin = cp.execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
    catch (e) { origin = ''; }
    const ok = !!(EXPECT[f.name] && EXPECT[f.name].test(origin));
    console.log('  §EZC_WS_FOLDER name=' + f.name + ' path=' + f.path + ' dir=' + dir + ' exists=' + fs.existsSync(dir) + ' origin=' + (origin || '-') + ' ok=' + ok);
    return { name: f.name, exists: fs.existsSync(dir), ok };
  });
}
guard('§EZC_WORKSPACE', function z1() {
  const ws = readJsonc(path.join(ROOT, 'bim.code-workspace'));
  const got = resolveFolders(ws, LAYOUT);
  const resolved = got.filter(g => g.ok).length;
  // red control: the same file with the second folder pointed somewhere wrong must NOT resolve it
  const bad = JSON.parse(JSON.stringify(ws)); bad.folders[1].path = '../no-such-checkout-ezc';
  const redOk = !resolveFolders(bad, LAYOUT)[1].ok;
  let v;
  if (ws.folders.length !== 2) v = 'FAIL';
  else if (!got[1].exists) v = 'INCONCLUSIVE';           // no bim-compiler beside this layout: nothing judged for folder 2
  else v = (resolved === 2 && redOk) ? 'PASS' : 'FAIL';
  line('§EZC_WORKSPACE', { folders: ws.folders.length, resolved, layout: LAYOUT, red_unresolved: redOk ? 'Y' : 'N' }, v);
});

// ── Z2 problem matchers ──────────────────────────────────────────────────────────────────────────────
guard('§EZC_MATCHER', function z2() {
  const tasks = readJsonc(path.join(ROOT, '.vscode', 'tasks.json')).tasks;
  const t = tasks.find(x => /^Run this witness/.test(x.label));
  if (!t || !Array.isArray(t.problemMatcher) || t.problemMatcher.length < 2) { line('§EZC_MATCHER', { task: t ? 'found' : 'missing', matchers: 0 }, 'FAIL'); return; }
  const errRe = new RegExp(t.problemMatcher.find(m => m.severity === 'error').pattern.regexp);
  const warnRe = new RegExp(t.problemMatcher.find(m => m.severity === 'warning').pattern.regexp);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ezc-matcher-'));
  const fixtures = {
    'fx_fail.js': "console.log('  PASS a'); console.log('  FAIL thing-holds — 3 rows broken'); console.log('§FX pass=1 fail=1 ran=4'); process.exitCode = 1;",
    'fx_inconclusive.js': "console.log('§FX sampled=0 verdict=INCONCLUSIVE');",
    'fx_pass.js': "console.log('  PASS a'); console.log('§FX pass=1 fail=0 ran=4 verdict=PASS');",
  };
  const res = {};
  for (const [f, src] of Object.entries(fixtures)) {
    fs.writeFileSync(path.join(tmp, f), src + '\n');
    const cmd = t.command.split('${workspaceFolder}').join(ROOT).split('${relativeFile}').join(f).split('${fileBasenameNoExtension}').join(f.replace(/\.js$/, ''));
    const r = cp.spawnSync('bash', ['-c', cmd], { cwd: tmp, encoding: 'utf8' });
    const out = (r.stdout || '').split('\n');
    res[f] = { exit: r.status, errors: out.filter(l => errRe.test(l)).length, warnings: out.filter(l => warnRe.test(l)).length,
               fileOk: out.filter(l => errRe.test(l) || warnRe.test(l)).every(l => (errRe.exec(l) || warnRe.exec(l))[1] === f) };
    console.log('  §EZC_MATCHER_FX file=' + f + ' exit=' + r.status + ' errors=' + res[f].errors + ' warnings=' + res[f].warnings + ' file_group_ok=' + res[f].fileOk);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  const failErrors = res['fx_fail.js'].errors, incWarn = res['fx_inconclusive.js'].warnings;
  const passHits = res['fx_pass.js'].errors + res['fx_pass.js'].warnings;               // red control: a clean run makes no Problems
  const exitKept = res['fx_fail.js'].exit === 1 && res['fx_pass.js'].exit === 0;        // the task still reports the real exit code
  const ok = failErrors === 1 && res['fx_fail.js'].warnings === 0 && incWarn === 1 && res['fx_inconclusive.js'].errors === 0 &&
             passHits === 0 && exitKept && Object.values(res).every(r => r.fileOk);
  line('§EZC_MATCHER', { fail_errors: failErrors, inconclusive_warnings: incWarn, pass_hits: passHits, exit_kept: exitKept ? 'Y' : 'N' }, ok ? 'PASS' : 'FAIL');
});

// ── Z3 snippet ───────────────────────────────────────────────────────────────────────────────────────
function expand(bodyLines, relPath) {
  return bodyLines.join('\n')
    .replace(/\$\{RELATIVE_FILEPATH\}/g, relPath)
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')          // ${n:default} -> default (the snippet has no nested placeholders)
    .replace(/\$\{\d+\}|\$\d+/g, '');             // ${n} / $n / $0 -> empty
}
function runSkeleton(src) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ezc-snippet-'));
  fs.mkdirSync(path.join(tmp, 'app', 'tests'), { recursive: true });
  fs.symlinkSync(path.join(ROOT, 'witness_kit'), path.join(tmp, 'witness_kit'));   // the REAL contract (node resolves ajv from its real path)
  const f = path.join(tmp, 'app', 'tests', 'witness_from_snippet.js');
  fs.writeFileSync(f, src);
  const r = cp.spawnSync(process.execPath, [f], { encoding: 'utf8' });
  fs.rmSync(tmp, { recursive: true, force: true });
  const out = (r.stdout || '') + (r.stderr || '');
  const summary = (out.match(/§WITNESS_\S+ pass=\d+ fail=(\d+) ran=(\d+)/) || []);
  return { exit: r.status, out, fail: summary[1] != null ? +summary[1] : null, ran: summary[2] != null ? +summary[2] : null };
}
guard('§EZC_SNIPPET', function z3() {
  const snips = readJsonc(path.join(ROOT, '.vscode', 'witness.code-snippets'));
  const s = Object.values(snips).find(x => x.prefix === 'witness');
  if (!s) { line('§EZC_SNIPPET', { snippet: 'missing' }, 'FAIL'); return; }
  const src = expand(s.body, 'app/tests/witness_from_snippet.js');
  const usesContract = /require\('\.\.\/\.\.\/witness_kit\/contract'\)/.test(src) && /\.redControl\(/.test(src) && /ISSUE THIS PROVES OR DISPROVES/.test(src);
  const unedited = runSkeleton(src);
  console.log('  §EZC_SNIPPET_UNEDITED exit=' + unedited.exit + ' fail=' + unedited.fail + ' ran=' + unedited.ran);
  // red control: the same skeleton with ONE real row filled in must PASS — proves this check can see a PASS when there is one
  const filled = runSkeleton(src.replace('return [];', 'return [{ id: 1 }];'));
  console.log('  §EZC_SNIPPET_FILLED exit=' + filled.exit + ' fail=' + filled.fail + ' ran=' + filled.ran);
  if (filled.exit !== 0) console.log(filled.out.split('\n').map(l => '    ' + l).join('\n'));
  const uneditedPass = unedited.exit === 0 || unedited.fail === 0;
  const ok = usesContract && !uneditedPass && unedited.fail > 0 && filled.exit === 0 && filled.fail === 0 && filled.ran === 1;
  line('§EZC_SNIPPET', { uses_contract: usesContract ? 'Y' : 'N', unedited_exit: unedited.exit, unedited_pass: uneditedPass ? 'Y' : 'N',
                         filled_pass: filled.exit === 0 && filled.fail === 0 ? 'Y' : 'N' }, ok ? 'PASS' : 'FAIL');
});

// ── Z4 slog + spec snippets ──────────────────────────────────────────────────────────────────────────────
// One § line = the whole stdout is a single line that starts with the section sign.
function isOneSectionLine(out) { const ls = out.split('\n').filter(Boolean); return ls.length === 1 && ls[0].startsWith('§'); }
function runLine(code) {
  const r = cp.spawnSync(process.execPath, ['-e', 'var value = 7;\n' + code], { encoding: 'utf8' });
  return { exit: r.status, out: r.stdout || '' };
}
guard('§EZC_LOG_SNIPPETS', function z4() {
  const snips = readJsonc(path.join(ROOT, '.vscode', 'witness.code-snippets'));
  const slog = Object.values(snips).find(x => x.prefix === 'slog');
  const spec = Object.values(snips).find(x => x.prefix === 'spec');
  if (!slog || !spec) { line('§EZC_LOG_SNIPPETS', { slog: slog ? 'found' : 'missing', spec: spec ? 'found' : 'missing' }, 'FAIL'); return; }
  const code = expand(slog.body, 'app/x.js');
  const ran = runLine(code);
  console.log('  §EZC_SLOG_RUN exit=' + ran.exit + ' out=' + JSON.stringify(ran.out.trim()));
  const slogOk = ran.exit === 0 && isOneSectionLine(ran.out);
  // red control: the same line without its section sign must NOT be judged a § line — proves the check can see a miss
  const red = runLine(code.replace('§', ''));
  console.log('  §EZC_SLOG_RED exit=' + red.exit + ' out=' + JSON.stringify(red.out.trim()));
  const redSeen = code.includes('§') && red.exit === 0 && !isOneSectionLine(red.out);
  const hdr = expand(spec.body, 'app/x.js').split('\n').filter(Boolean);
  const allComment = hdr.length > 0 && hdr.every(l => l.startsWith('//'));
  const marker = /^\/\/ # ⚠ DO NOT REMOVE — SPEC \(W-/.test(hdr[0] || '');
  const logRule = hdr.some(l => /Read the log after every run/.test(l)) && hdr.some(l => /^\/\/ ISSUE:/.test(l));
  console.log('  §EZC_SPEC_HEADER lines=' + hdr.length + ' all_comment=' + allComment + ' marker=' + marker + ' log_rule=' + logRule);
  const ok = slogOk && redSeen && allComment && marker && logRule;
  line('§EZC_LOG_SNIPPETS', { slog_prints: slogOk ? 'Y' : 'N', red_not_section: redSeen ? 'Y' : 'N', spec_lines: hdr.length,
                              spec_header: allComment && marker && logRule ? 'Y' : 'N' }, ok ? 'PASS' : 'FAIL');
});

const final = verdicts.includes('FAIL') ? 'FAIL' : verdicts.includes('INCONCLUSIVE') ? 'INCONCLUSIVE' : 'PASS';
console.log('§EZC checks=' + verdicts.length + ' verdict=' + final);
if (final === 'FAIL') process.exitCode = 1;
