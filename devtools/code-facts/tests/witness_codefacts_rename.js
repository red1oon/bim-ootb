#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-CODEFACTS-RENAME (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.40; bim-ootb issue #3311).
// Read the log after every run: exit code is not evidence. Verdict line: §CODEFACTS_RENAME checks= pass= fail= verdict=PASS|FAIL|INCONCLUSIVE.
// ISSUE THIS PROVES OR DISPROVES: "the tool formerly called X0 / x0 was renamed to code-facts, but a live file, an install id, a CI step or a
//   link still uses the old name, so a newcomer meets two names for one tool, or an install/CI path is dead".
// INDEPENDENT SOURCE: the repository's own file list (scripts/lib/tracked_files.js) and the file contents; the recorded verdicts of the 20
//   former W-X0-* witnesses measured on the pre-rename tree (fixtures/before_verdicts.json).
// RED CONTROLS (reported, not hidden): R1 scans a planted file holding an old name and must count it; run the whole witness with
//   `--root <a pre-rename checkout>` and R1 must FAIL (recorded in the PR: it found N files).
// Usage: node devtools/code-facts/tests/witness_codefacts_rename.js [--root <checkout>] [--go]
//   --go also re-runs every renamed witness and compares its verdict word with the recorded one (~5 min); without it R2 checks only that each
//   recorded witness exists under its new name and prints its renamed tag (static, ~1 s).
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const ROOT = path.resolve(arg('--root') || path.join(__dirname, '..', '..', '..')), GO = process.argv.includes('--go');
const say = s => process.stdout.write(s + '\n'), tf = require(path.join(__dirname, '..', '..', '..', 'scripts', 'lib', 'tracked_files.js'));
const checks = []; const check = (k, ok, d) => { checks.push(ok); say(`  §CODEFACTS_RENAME_CHECK ${k} ok=${ok ? 'Y' : 'N'} ${d}`); };
let inconclusive = null;

// R1 — the old name, as the TOOL's name (a bare x0 / X0 is also a coordinate in drawing code: not this tool)
const OLD = /X0 Navigator|x0-navigator|x0-facts|devtools\/x0|\bx0\.js|§X0_|W-X0|witness_x0_|ci_x0_|bim_x0|x0Navigator|x0RunShip|bim-devtools\.x0|\bx0 (where|uses|tag|loaded|cost|last|context|check|pure|bump|session|help)\b/;
// HISTORY: left as it was written on purpose (§F.40). Every entry names its reason.
const HIST = [
  [/\.log$/, 'saved witness logs record what was true when they ran'], [/^CHANGELOG\.md$/, 'release-please output: the commit titles of the time'],
  [/^prompts\/archive\//, 'archived history'], [/^IFC\//, 'IFC data'], [/^buildings\/patches\//, 'data patches'], [/^viewer\/textures\//, 'texture data'],
  [/^devtools\/code-facts\/tests\/witness_codefacts_rename\.js$/, 'this witness names the old patterns it hunts'],
  [/^devtools\/code-facts\/tests\/fixtures\/before_verdicts\.json$/, 'the recorded old verdicts name the old tags'],
  [/^prompts\/MODELLER_LOD_UPGRADE_PILL\.md$/, "another live lane's dated 'Built:' records quote the old witness name as it was then"],
  [/\.(png|jpg|jpeg|gif|db|ifc|glb|gz|zip|pdf|docx|mp4|wav|ttf|woff2?|vsix)$/, 'binary']];
const files = tf.trackedFiles(ROOT).filter(f => !HIST.some(([re]) => re.test(f)));
const hits = [];
for (const f of files) {
  let s; try { const st = fs.statSync(path.join(ROOT, f)); if (st.size > 3 << 20) continue; s = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { continue; }
  const ls = s.split('\n'); for (let i = 0; i < ls.length; i++) if (OLD.test(ls[i]) && !/[Ff]ormerly/.test(ls[i])) hits.push(f + ':' + (i + 1));   // a line that says "formerly …" names the old name on purpose
}
const hitFiles = [...new Set(hits.map(h => h.split(':')[0]))];
say(`  §CODEFACTS_RENAME_R1 files_judged=${files.length} old_name_lines=${hits.length} old_name_files=${hitFiles.length}${hits.length ? ' e.g. ' + hits.slice(0, 5).join(',') : ''}`);
if (!files.length) inconclusive = 'R1 judged no file (empty population)';
check('R1 no live file names the tool X0', files.length > 0 && hits.length === 0, `files=${hitFiles.length}`);
{ // red control: the scanner counts a planted old name
  const planted = ['// formerly the x0-navigator folder', 'plain text'].filter(l => OLD.test(l)).length;
  check('R1c scanner counts a planted old name (red control)', planted === 1, `planted_hits=${planted}`); }

// R2 — the renamed witnesses still exist and keep their verdict
const fx = path.join(__dirname, 'fixtures', 'before_verdicts.json');
let rec = null; try { rec = JSON.parse(fs.readFileSync(fx, 'utf8')); } catch (e) { /* reported below */ }
if (!rec) { inconclusive = inconclusive || 'R2 fixtures/before_verdicts.json missing'; check('R2 recorded verdicts present', false, fx); }
else {
  const entries = Object.entries(rec.witnesses);
  const missing = entries.filter(([n, e]) => !fs.existsSync(path.join(ROOT, e.path)));
  check('R2a every former W-X0-* witness exists under its new name', missing.length === 0, `recorded=${entries.length} missing=${missing.map(m => m[0]).join(',') || 0}`);
  const wrongTag = entries.filter(([n, e]) => { try { return !fs.readFileSync(path.join(ROOT, e.path), 'utf8').includes(e.tag); } catch (x) { return true; } });
  check('R2b each prints its renamed tag', wrongTag.length === 0, `tags_missing=${wrongTag.map(m => m[0]).join(',') || 0}`);
  if (GO) {
    let same = 0; const diff = [];
    for (const [n, e] of entries) {
      const r = cp.spawnSync('nice', ['-n', '19', process.execPath, path.join(ROOT, e.path), '--compiler-root', arg('--compiler-root') || path.join(ROOT, '..', 'bim-compiler')],
        { cwd: ROOT, encoding: 'utf8', timeout: 600000, stdin: 'ignore', env: Object.assign({}, process.env, { CODEFACTS_COMPILER_ROOT: arg('--compiler-root') || '' }) });
      const line = ((r.stdout || '') + (r.stderr || '')).split('\n').filter(l => /VERDICT|verdict=/.test(l)).pop() || '';
      const word = (/(?:VERDICT |verdict=)(PASS|FAIL|INCONCLUSIVE)/.exec(line) || [])[1] || 'NONE';
      say(`    §CODEFACTS_RENAME_R2 ${n} before=${e.verdict} now=${word}`); if (word === e.verdict) same++; else diff.push(n);
    }
    check('R2c every renamed witness gives its recorded verdict word', diff.length === 0, `same=${same}/${entries.length} changed=${diff.join(',') || 0}`);
  } else say('  §CODEFACTS_RENAME_R2c skipped (no --go): the verdict comparison runs with --go');
}

// R3 — the install path carries the new id
const pk = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'devtools/vscode/code-facts/package.json'), 'utf8')); } catch (e) { return null; } })();
check('R3a add-on manifest: name code-facts, display "BIM DevTools: Code Facts"', !!pk && pk.name === 'code-facts' && /^BIM DevTools: Code Facts$/.test(pk.displayName || ''), pk ? `${pk.publisher}.${pk.name}` : 'no package.json');
const idFiles = ['scripts/setup.js', 'scripts/tests/setup_vsc_suite.js', 'scripts/tests/witness_setup.js', 'devtools/vscode/pack.js'];
const idBad = idFiles.filter(f => { try { return /x0-navigator|bim-devtools\.x0/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { return true; } });
const idGood = fs.existsSync(path.join(ROOT, 'scripts/tests/setup_vsc_suite.js')) && /bim-devtools\.code-facts/.test(fs.readFileSync(path.join(ROOT, 'scripts/tests/setup_vsc_suite.js'), 'utf8'));
check('R3b install/pack/suite files name only the new id', idBad.length === 0 && idGood, `old_id_in=${idBad.join(',') || 0} suite_uses_new=${idGood ? 'Y' : 'N'}`);
const stale = ['devtools/vscode/dist', '.setup'].filter(d => { try { return fs.readdirSync(path.join(ROOT, d), { recursive: true }).some(n => /x0-navigator/.test(String(n))); } catch (e) { return false; } });
check('R3c no x0-navigator artefact in dist/ or .setup/', stale.length === 0, `in=${stale.join(',') || 0}`);

// R4 — no dead path
const refSources = ['.github/workflows/ci.yml', '.github/workflows/deploy-pages.yml', 'tests/ci_fast_tier.json', 'package.json', '.vscode/tasks.json', '.vscode/launch.json', '.vscode/settings.json', '.vscode/witness.code-snippets', 'scripts/setup.js'];
const dead = [];
for (const f of refSources) {
  let s; try { s = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { continue; }
  for (const mm of s.matchAll(/devtools\/[A-Za-z0-9_.\/-]*[A-Za-z0-9_]/g)) { const m = mm[0], next = s[mm.index + m.length] || ''; if (/[$<*{]/.test(next + m)) continue; if (!fs.existsSync(path.join(ROOT, m))) dead.push(f + ' → ' + m); }
}
check('R4a every devtools/ path named by CI, snippets, tasks and setup exists', dead.length === 0, `dead=${[...new Set(dead)].slice(0, 5).join(' | ') || 0}`);
const gm = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts/gen_manifest.js'), '--check'], { cwd: ROOT, encoding: 'utf8', timeout: 300000, stdin: 'ignore' });
const gmv = ((gm.stdout || '').split('\n').filter(l => /§MANIFEST_CHECK/.test(l)).pop() || '');
check('R4b gen_manifest --check verdict=PASS', /verdict=PASS/.test(gmv), gmv.replace(/^.*(verdict=\S+).*$/, '$1') || 'no line');

const pass = checks.filter(Boolean).length, fail = checks.length - pass;
const verdict = inconclusive ? 'INCONCLUSIVE' : fail ? 'FAIL' : 'PASS';
say(`§CODEFACTS_RENAME checks=${checks.length} pass=${pass} fail=${fail} go=${GO ? 'Y' : 'N'} verdict=${verdict}${inconclusive ? ' reason=' + JSON.stringify(inconclusive) : ''}`);
process.exit(verdict === 'PASS' ? 0 : 1);
