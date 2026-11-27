#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-PHONE-CENSUS (bim-compiler prompts/MOBILE_PERF.md "WO-1"). Read the log after every run: the exit code is not evidence.
//   Verdict line: §W-PHONE-CENSUS checks=4 fail=<n> verdict=PASS|FAIL|INCONCLUSIVE.
// ISSUE THIS PROVES OR DISPROVES: "nobody knows which kept code calls into the files a phone will drop" — i.e. scripts/phone_census.js (a) sums the same bytes the boot-weight
//   ratchet sums (so its numbers are THE phone number, not a second opinion), (b) lists a `uses` pair only where the kept file really contains a name the flagged file defines
//   (not a stale manifest edge), (c) can FAIL: a kept module whose `deps` names a flagged file makes it print §PHONE_DEP and verdict=FAIL, (d) changed no file's loading.
// POPULATION: the flags in viewer/modules.json (`"phone": false` + `"phoneGroup"`), the viewer page's <script src> tags, the manifest's `uses` / `deps` edges.
//   C1 the tool's bytes (flagged + kept) equal the eager bytes `node scripts/boot_weight.js` prints, to the byte (and the kb fields add up to the same figure within rounding)
//   C2 every §PHONE_USE pair is found again by an independent raw-text grep of the kept file for a PUBLIC name the flagged file defines (window./A./root. assignment, column-0
//      declaration); judged pairs must be > 0, else INCONCLUSIVE
//   C3 RED CONTROL: in a temp copy of modules.json the target of the first `deps` edge between two UNFLAGGED viewer modules is flagged; the tool must print a §PHONE_DEP line
//      for it and verdict=FAIL (and the real manifest must give no §PHONE_DEP and verdict=PASS, or the control proves nothing)
//   C4 SCOPE GUARD (WO-1 only; WO-2 deletes it when it edits the page): `git diff` against the merge-base with origin/main shows no change to viewer/viewer.html or viewer/sw.js
// INCONCLUSIVE: no module flagged, no deps edge to flip, no USE pair, no git base, an empty diff. Never PASS on an empty population.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const run = (args, opts) => cp.spawnSync(process.execPath, args, Object.assign({ cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }, opts || {}));
const line = (txt, tag) => (txt.split('\n').filter(l => l.startsWith(tag)).pop() || '');
const kv = (l, k) => { const m = new RegExp('(?:^|\\s)' + k + '=(\\S+)').exec(l); return m ? m[1] : null; };
const res = [];   // {id, state: PASS|FAIL|INCONCLUSIVE, why}
const note = (id, state, why) => { res.push({ id, state, why }); console.log(`§W-PHONE-CENSUS ${id} ${state} ${why}`); };

const LOG = process.env.PHONE_CENSUS_LOG || path.join(os.tmpdir(), 'phone_census_witness.log');
const real = run(['scripts/phone_census.js']);
fs.writeFileSync(LOG, real.stdout + (real.stderr || ''));
const rtxt = real.stdout, census = line(rtxt, '§PHONE_CENSUS'), bytes = line(rtxt, '§PHONE_BYTES');

// ---- C1
{
  const bw = run(['scripts/boot_weight.js']).stdout, eager = +kv(line(bw, '§BOOT_WEIGHT '), 'eager_bytes');
  const f = +kv(bytes, 'flagged'), k = +kv(bytes, 'kept'), kbSum = +kv(census, 'kb_flagged') + +kv(census, 'kb_kept');
  if (!census || !bytes || !(eager > 0)) note('C1', 'INCONCLUSIVE', `census=${!!census} bytes=${!!bytes} boot_weight eager=${eager}`);
  else if (f + k !== eager) note('C1', 'FAIL', `flagged ${f} + kept ${k} = ${f + k} != boot_weight eager_bytes ${eager}`);
  else if (Math.abs(kbSum * 1024 - eager) > 1024) note('C1', 'FAIL', `kb fields ${kbSum} KB do not add up to ${eager} bytes`);
  else note('C1', 'PASS', `flagged ${f} + kept ${k} = ${f + k} = boot_weight eager_bytes ${eager}`);
}

// ---- C2
{
  const pairs = rtxt.split('\n').filter(l => l.startsWith('§PHONE_USE')).map(l => ({ k: kv(l, 'kept'), f: kv(l, 'uses') }));
  const publicNames = f => {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8'), s = new Set(); let x;
    const r1 = /\b(?:window|APP|A|global|globalThis|self|root)\.([A-Za-z_$][\w$]{2,})\s*=(?!=)/g; while ((x = r1.exec(t))) s.add(x[1]);
    const r2 = /^(?:async\s+)?(?:function\*?|var|let|const|class)\s+([A-Za-z_$][\w$]{2,})/gm; while ((x = r2.exec(t))) s.add(x[1]);
    return [...s];
  };
  const miss = [];
  for (const p of pairs) {
    const kt = fs.readFileSync(path.join(ROOT, p.k.split('#')[0]), 'utf8');   // an inline reader: the whole page text
    const hit = publicNames(p.f).filter(n => new RegExp('(?<![\\w$])' + n.replace(/\$/g, '\\$') + '(?![\\w$])').test(kt));
    if (!hit.length) miss.push(`${p.k} -> ${p.f}`);
  }
  if (!pairs.length) note('C2', 'INCONCLUSIVE', 'no §PHONE_USE pair to judge');
  else if (miss.length) note('C2', 'FAIL', `${miss.length}/${pairs.length} pairs not found again: ${miss.slice(0, 5).join(' ; ')}`);
  else note('C2', 'PASS', `${pairs.length}/${pairs.length} §PHONE_USE pairs found again by raw grep`);
}

// ---- C3
{
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'modules.json'), 'utf8'));
  const realDeps = rtxt.split('\n').filter(l => l.startsWith('§PHONE_DEP')).length;
  const eagerFiles = new Set((man.order['viewer/viewer.html'] || []).filter(s => s.kind === 'tag').map(s => path.posix.normalize('viewer/' + s.as)));
  let edge = null;
  for (const [f, v] of Object.entries(man.modules).sort()) {
    if (v.phone === false || !eagerFiles.has(f)) continue;
    const d = (v.deps || []).find(x => man.modules[x] && man.modules[x].phone !== false && eagerFiles.has(x));
    if (d) { edge = { reader: f, target: d }; break; }
  }
  if (!edge) note('C3', 'INCONCLUSIVE', 'no deps edge between two unflagged viewer modules');
  else if (realDeps !== 0 || kv(census, 'verdict') !== 'PASS') note('C3', 'INCONCLUSIVE', `the real manifest is not clean (dep_blocks=${realDeps} verdict=${kv(census, 'verdict')}): the control would prove nothing`);
  else {
    man.modules[edge.target].phone = false; man.modules[edge.target].phoneGroup = 'film';
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'phone_census_')), 'modules.json');
    fs.writeFileSync(tmp, JSON.stringify(man));
    const red = run(['scripts/phone_census.js', '--modules', tmp]).stdout;
    const dep = red.split('\n').filter(l => l.startsWith('§PHONE_DEP') && l.includes(`kept=${edge.reader} `) && l.includes(`needs=${edge.target}`));
    const v = kv(line(red, '§PHONE_CENSUS'), 'verdict');
    if (dep.length === 1 && v === 'FAIL') note('C3', 'PASS', `flagging ${edge.target} (kept reader ${edge.reader}) printed "${dep[0]}" and verdict=FAIL`);
    else note('C3', 'FAIL', `red control NOT detected: §PHONE_DEP lines for the pair=${dep.length} verdict=${v}`);
  }
}

// ---- C4
{
  const git = a => cp.spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
  const base = git(['merge-base', 'HEAD', 'origin/main']);
  if (base.status !== 0) note('C4', 'INCONCLUSIVE', 'no origin/main to compare with');
  else {
    const names = git(['diff', '--name-only', base.stdout.trim()]).stdout.split('\n').filter(Boolean).concat(git(['ls-files', '--others', '--exclude-standard']).stdout.split('\n').filter(Boolean));
    const touched = names.filter(n => n === 'viewer/viewer.html' || n === 'viewer/sw.js');
    if (!names.length) note('C4', 'INCONCLUSIVE', 'the diff against the merge-base is empty (run this witness on the WO-1 branch)');
    else if (touched.length) note('C4', 'FAIL', `changed: ${touched.join(', ')}`);
    else note('C4', 'PASS', `${names.length} changed file(s) since ${base.stdout.trim().slice(0, 8)}, none of viewer/viewer.html or viewer/sw.js`);
  }
}

const fail = res.filter(r => r.state === 'FAIL').length, inc = res.filter(r => r.state === 'INCONCLUSIVE').length;
const verdict = fail ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS';
console.log(`§W-PHONE-CENSUS census_log=${LOG}`);
console.log(`§W-PHONE-CENSUS checks=${res.length} fail=${fail}${inc ? ' inconclusive=' + inc : ''} verdict=${verdict}`);
process.exit(verdict === 'PASS' ? 0 : 1);
