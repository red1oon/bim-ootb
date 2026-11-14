#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-SHIP-PANEL, first version (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.12c, issue #2947).
// Read the log after every run: exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "a broken or un-bumped change ships, or a merge is called live when the site is not on it".
// POPULATION: a fixture repo made here (one app with a service worker, a page, a script, a version.json) and a FAKE live site
//   (a function that answers like the web server would), plus this real repo's Check.
// CASES (§F.2's own): (a) a planted syntax error stops at Check, later steps are not run; (b) a precached file changed without a
//   bump stops at Check; (c) the live site on an older CACHE_VERSION → Fetch back FAIL; (d) a live version.json whose sha is not
//   main's → FAIL. RED CONTROL: a clean fixture, and a changed-and-bumped one, pass every step; a matching live site passes.
// No parser or no git → INCONCLUSIVE. The real network is used ONLY with --live (one read of the project's public site).
// Command: node devtools/vscode/x0-navigator/tests/witness_x0_ship.js [--live]
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const S = require('../lib/ship');
const J = require('../lib/js_facts');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SEC = '§';
let fail = 0;
function check(label, cond) { console.log('  ' + (cond ? 'PASS ' : 'FAIL ') + label); if (!cond) fail++; return !!cond; }
function summary(f, verdict) { console.log(SEC + 'SHIP_PANEL ' + Object.keys(f).map(k => k + '=' + f[k]).join(' ') + ' verdict=' + verdict); }
if (!J.loadTs(ROOT)) { summary({ parser: 'N' }, 'INCONCLUSIVE'); process.exit(0); }

(async () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'x0-ship-'));
  const w = (rel, txt) => { fs.mkdirSync(path.dirname(path.join(TMP, rel)), { recursive: true }); fs.writeFileSync(path.join(TMP, rel), txt); };
  const g = a => cp.spawnSync('git', a, { cwd: TMP, encoding: 'utf8' });
  if (g(['init', '-q']).status !== 0) { summary({ git: 'N' }, 'INCONCLUSIVE'); return; }
  const sw = v => "const CACHE_VERSION = '" + v + "';\nconst PRECACHE_ASSETS = ['page.html', 'a.js'];\n";
  w('scripts/lib/find_ts.js', fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'find_ts.js'), 'utf8'));
  w('app/sw.js', sw('v1')); w('app/page.html', '<script src="a.js"></script>\n'); w('app/a.js', 'var a = 1;\n'); w('app/version.json', '{"sha":"placeholder"}\n');
  g(['add', '-A']); g(['-c', 'user.name=w', '-c', 'user.email=w@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', 'base']);
  const sha = (g(['rev-parse', 'HEAD']).stdout || '').trim();
  const show = r => r.lines.forEach(l => console.log('    ' + l.slice(0, 210)));

  // RED CONTROL: clean
  const c0 = S.check(TMP, 'HEAD'); show(c0);
  const cleanOk = check('red control: a clean fixture passes Check (the audit script is absent there and is reported SKIPPED, not passed)',
    c0.ok && c0.lines.some(l => /SHIP_AUDIT verdict=SKIPPED/.test(l)) && c0.lines.some(l => /SHIP_BUMP app=app verdict=PASS precached_files_changed=0/.test(l)));

  // (a) a planted syntax error
  w('app/a.js', 'var a = ;\n');
  const ca = S.check(TMP, 'HEAD'); show(ca);
  const aOk = check('(a) a planted syntax error stops at the syntax step; the audit and bump steps are not run',
    !ca.ok && ca.stoppedAt === 'syntax' && !ca.lines.some(l => /SHIP_AUDIT|SHIP_BUMP/.test(l)) && ca.lines.some(l => /file=app\/a\.js/.test(l)));

  // (b) a valid change to a precached file, no bump
  w('app/a.js', 'var a = 2;\n');
  const cb = S.check(TMP, 'HEAD'); show(cb);
  const bOk = check('(b) a precached file changed without a bump stops at the bump step, naming the app',
    !cb.ok && cb.stoppedAt === 'bump' && cb.lines.some(l => /SHIP_BUMP app=app verdict=FAIL precached_files_changed=1 cache_version=v1 \(unchanged\) first=app\/a\.js/.test(l)));

  // RED CONTROL: the same change WITH a bump
  w('app/sw.js', sw('v2'));
  const cc = S.check(TMP, 'HEAD'); show(cc);
  const bumpedOk = check('red control: the same change with CACHE_VERSION bumped v1->v2 passes', cc.ok && cc.lines.some(l => /cache_version=v1->v2/.test(l)));

  // One-click bump (decision F-6): the rule for ONE file, and the repo's own bump script run through the lib, on a second
  // fixture whose page carries a ?v= (the form scripts/bump.js edits).
  const FX = fs.mkdtempSync(path.join(os.tmpdir(), 'x0-bumpfix-'));
  const w2 = (rel, txt) => { fs.mkdirSync(path.dirname(path.join(FX, rel)), { recursive: true }); fs.writeFileSync(path.join(FX, rel), txt); };
  const g2 = a => cp.spawnSync('git', a, { cwd: FX, encoding: 'utf8' });
  g2(['init', '-q']);
  w2('scripts/lib/find_ts.js', fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'find_ts.js'), 'utf8'));
  w2('app/sw.js', "const CACHE_VERSION = 'v7';\nconst PRECACHE_ASSETS = [\n  'page.html',\n  'a.js',\n];\n");
  w2('app/page.html', '<script src="a.js?v=3"></script>\n'); w2('app/a.js', 'var a = 1;\n'); w2('app/loose.js', 'var loose = 1;\n');
  g2(['add', '-A']); g2(['-c', 'user.name=w', '-c', 'user.email=w@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', 'base']);
  const read2 = rel => fs.readFileSync(path.join(FX, rel), 'utf8');
  const n0 = S.needsBump(FX, 'app/a.js', 'HEAD');
  w2('app/a.js', 'var a = 2;\n'); w2('app/loose.js', 'var loose = 2;\n');
  const n1 = S.needsBump(FX, 'app/a.js', 'HEAD'), nLoose = S.needsBump(FX, 'app/loose.js', 'HEAD');
  const needOk = check('one file: an edited cached file needs a bump, and the app and version are named (' + JSON.stringify(n1) + ')', !!n1 && n1.app === 'app' && n1.version === 'v7' && n1.sw === 'app/sw.js');
  const needRedOk = check('red controls: the same file BEFORE the edit, and an edited file no cache list names, are not flagged', n0 === null && nLoose === null);
  const before = read2('app/sw.js') + read2('app/page.html');
  const dry = S.bump(FX, 'app/a.js', false, process.execPath, ROOT); dry.lines.forEach(l => console.log('    ' + l.slice(0, 200)));
  const dryOk = check('the dry run (the repo\'s own scripts/bump.js) names both edits and writes nothing', dry.ok && dry.lines.some(l => /BUMP sw=app\/sw\.js CACHE_VERSION v7->v8/.test(l)) && dry.lines.some(l => /ref=.*v=3->4/.test(l)) &&
    read2('app/sw.js') + read2('app/page.html') === before && /mode=dry exit=0 verdict=PASS/.test(dry.lines[dry.lines.length - 1]));
  const wr = S.bump(FX, 'app/a.js', true, process.execPath, ROOT);
  const n2 = S.needsBump(FX, 'app/a.js', 'HEAD'), c2 = S.check(FX, 'HEAD');
  const appliedOk = check('the applied bump raises CACHE_VERSION to v8 and the page\'s ?v= to 4; after it the file is no longer flagged and Check passes',
    wr.ok && /CACHE_VERSION = 'v8'/.test(read2('app/sw.js')) && /a\.js\?v=4/.test(read2('app/page.html')) && n2 === null && c2.ok);
  const noScript = S.bump(FX, 'app/a.js', false, process.execPath);
  check('a repo without scripts/bump.js → INCONCLUSIVE, nothing run', !noScript.ok && /verdict=INCONCLUSIVE/.test(noScript.lines[0]));
  fs.rmSync(FX, { recursive: true, force: true });

  // Fetch back against a fake live site (main = the committed fixture: v1, sha)
  const site = (swText, json) => async url => (/\/app\/sw\.js/.test(url) ? { status: 200, text: swText } : /version\.json/.test(url) ? { status: 200, text: json } : { status: 404, text: '' });
  const fGood = await S.fetchBack(TMP, { site: 'http://fake.invalid', base: 'HEAD', get: site('const CACHE_VERSION="v1",x=1;', JSON.stringify({ sha: sha.slice(0, 8) })) }); show(fGood);
  const goodOk = check('red control: a live site on main\'s version and sha → Fetch back PASS (minified form read by the parser)', fGood.ok);
  const fOld = await S.fetchBack(TMP, { site: 'http://fake.invalid', base: 'HEAD', get: site("const CACHE_VERSION = 'v0';", JSON.stringify({ sha: sha.slice(0, 8) })) }); show(fOld);
  const cOk = check('(c) the live site on an older CACHE_VERSION → Fetch back FAIL', !fOld.ok && fOld.lines.some(l => /app=app http=200 live=v0 main=v1 match=N/.test(l)));
  const fSha = await S.fetchBack(TMP, { site: 'http://fake.invalid', base: 'HEAD', get: site("const CACHE_VERSION = 'v1';", '{"sha":"0000000f"}') }); show(fSha);
  const dOk = check('(d) a live version.json whose sha is not main\'s → Fetch back FAIL', !fSha.ok && fSha.lines.some(l => /version\.json http=200 live_sha=0000000f .* match=N/.test(l)));
  const fDown = await S.fetchBack(TMP, { site: 'http://fake.invalid', base: 'HEAD', get: async () => ({ status: 0, text: '' }) });
  check('an unreachable site is a FAIL, never a pass', !fDown.ok && fDown.verdict === 'FAIL');
  const fBroken = await S.fetchBack(TMP, { site: 'http://fake.invalid', base: 'HEAD', get: site("const CACHE_VERSION = 'v1';", '{"sha":"' + sha.slice(0, 8) + '","pr":12\n13}') }); show(fBroken);
  check('a live stamp that is not valid JSON (the 2026-11-13 deploy: two PR numbers on two lines) → FAIL, named as unreadable',
    !fBroken.ok && fBroken.verdict === 'FAIL' && fBroken.lines.some(l => /live_sha=unreadable/.test(l)));
  const fNoStamp = await S.fetchBack(TMP, { site: 'http://fake.invalid', base: 'HEAD', get: async url => (/sw\.js/.test(url) ? { status: 200, text: "const CACHE_VERSION = 'v1';" } : { status: 404, text: '<html>' }) }); show(fNoStamp);
  const noStampOk = check('versions match but the live site carries no deploy stamp → INCONCLUSIVE, never PASS', !fNoStamp.ok && fNoStamp.verdict === 'INCONCLUSIVE');
  fs.rmSync(TMP, { recursive: true, force: true });

  // this real repo: what Run local and Check say now (compared with the commit it stands on, so a clean tree passes)
  const run = S.runLocalLines(ROOT); run.forEach(l => console.log('    ' + l));
  const realRun = check('real repo: Run local lists each app with its disk version and local URL (' + run.filter(l => l.startsWith(SEC + 'SHIP_RUN app=')).length + ')',
    run.filter(l => /SHIP_RUN app=\S+ disk_version=v\d+ url=http:\/\/localhost:8000\/\S+\.html/.test(l)).length >= 3);
  const rc = S.check(ROOT, 'HEAD'); show(rc);
  const dirtyJs = cp.spawnSync('git', ['status', '--porcelain', '--', '*.js'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean).length;
  const realCheck = check('real repo: Check runs the real precache audit and passes on this tree (' + dirtyJs + ' JS files differ from HEAD)', rc.ok && rc.lines.some(l => /SHIP_AUDIT verdict=PASS/.test(l)));
  console.log('    live site derived from the git remote: ' + S.liveSite(ROOT));
  let live = 'not_run';
  if (process.argv.includes('--live')) {
    const fb = await S.fetchBack(ROOT, { base: 'origin/main' }); show(fb);
    live = fb.verdict;
    check('real site answered for every app (whether it matches main depends on the deploy, so it is reported, not judged)', fb.lines.filter(l => / http=200 /.test(l)).length >= 3);
  }
  const yn = x => (x ? 'Y' : 'N');
  summary({ syntax_stops: yn(aOk), bump_stops: yn(bOk), old_live_fails: yn(cOk), wrong_sha_fails: yn(dOk), red_clean: yn(cleanOk), red_bumped: yn(bumpedOk), one_file_needs: yn(needOk), one_file_red: yn(needRedOk), dry_writes_nothing: yn(dryOk), applied: yn(appliedOk), red_live_match: yn(goodOk), no_stamp_inconclusive: yn(noStampOk),
    real_run: yn(realRun), real_check: yn(realCheck), real_live: live }, fail === 0 ? 'PASS' : 'FAIL');
  if (fail) process.exitCode = 1;
})().catch(e => { console.log('  FAIL witness crashed: ' + (e && e.stack)); summary({ crashed: 'Y' }, 'FAIL'); process.exitCode = 1; });
