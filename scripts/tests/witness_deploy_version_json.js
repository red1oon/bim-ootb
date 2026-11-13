#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-DEPLOY-VERSION-JSON (bim-ootb #2949; found by X0 Navigator's Fetch back, 2026-11-13)
// ISSUE THIS PROVES OR DISPROVES: "the deploy writes an erp/version.json that is not valid JSON" — it did, whenever the merged
//   commit's subject held two (#N) (an issue and a PR): the `pr` field got two numbers on two lines.
// HOW: the stamp step's OWN shell lines are read from .github/workflows/deploy-pages.yml and run here with the commit subject
//   replaced by test subjects; the printed file must parse as JSON, and `pr` must be the LAST (#N).
// RED CONTROL: the same step with the fix removed (`| tail -n 1` taken out) must produce invalid JSON for a two-number subject.
// Command: node scripts/tests/witness_deploy_version_json.js      Final line: §DEPLOY_VERSION_JSON … verdict=. Read the log.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'deploy-pages.yml'), 'utf8').split('\n');
const prLine = yml.find(l => /^\s*PR=\$\(git log -1 --pretty=%s/.test(l));
const printfLine = yml.find(l => /^\s*printf '\{"version"/.test(l));
function out(f, verdict) { console.log('\u00a7DEPLOY_VERSION_JSON ' + Object.keys(f).map(k => k + '=' + f[k]).join(' ') + ' verdict=' + verdict); }
if (!prLine || !printfLine) { console.log('  the stamp step was not found in deploy-pages.yml'); out({ step_found: 'N' }, 'INCONCLUSIVE'); process.exit(0); }
let fail = 0;
function check(label, cond) { console.log('  ' + (cond ? 'PASS ' : 'FAIL ') + label); if (!cond) fail++; return !!cond; }
function stamp(subject, pr) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ver-json-'));
  fs.mkdirSync(path.join(tmp, 'erp'));
  const script = ['VERSION=v1.0.0', 'BUILD=v1', 'SHA=abcdef12', 'DATE=2026-01-01',
    pr.trim().replace('git log -1 --pretty=%s', 'printf "%s" "$SUBJ"'), printfLine.trim()].join('\n');
  cp.spawnSync('bash', ['-c', script], { cwd: tmp, env: Object.assign({}, process.env, { SUBJ: subject }), encoding: 'utf8' });
  let text = ''; try { text = fs.readFileSync(path.join(tmp, 'erp', 'version.json'), 'utf8'); } catch (e) { text = ''; }
  fs.rmSync(tmp, { recursive: true, force: true });
  let json = null; try { json = JSON.parse(text); } catch (e) { json = null; }
  return { text, json };
}
const two = stamp('feat: a thing (#2947) (#2948)', prLine);
const twoOk = check('subject with an issue and a PR number → valid JSON, pr = the last one (' + (two.json && two.json.pr) + ')', !!two.json && two.json.pr === 2948 && two.json.sha === 'abcdef12');
const one = stamp('fix: another thing (#77)', prLine);
const oneOk = check('subject with one number → valid JSON, pr = 77', !!one.json && one.json.pr === 77);
const none = stamp('a direct push with no number', prLine);
const noneOk = check('subject with no number → valid JSON, pr = null', !!none.json && none.json.pr === null);
const old = stamp('feat: a thing (#2947) (#2948)', prLine.replace(/\|\s*tail -n 1\s*/, ''));
const redOk = check('red control: without the fix the same subject gives INVALID JSON (' + JSON.stringify(old.text.slice(-30)) + ')', prLine.includes('tail -n 1') && old.json === null);
const yn = b => (b ? 'Y' : 'N');
out({ two_numbers: yn(twoOk), one_number: yn(oneOk), no_number: yn(noneOk), red_invalid_without_fix: yn(redOk) }, fail === 0 ? 'PASS' : 'FAIL');
if (fail) process.exitCode = 1;
