#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-X0-REFS (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.19, issue #2983).
// Read the log after every run: exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "Find All References on a field of the shared object misses sites, invents sites, or
//   jumps to a line that no longer holds the field".
// POPULATION: the REAL tree, scanned by the repo's own generator (R12 site list) into a temp folder; fields sampled evenly
//   from its index. No fixture stands in for the scan.
// CHECKS: per sampled field, write sites == the index's write count, write+read lines == what the index counted, and every
//   returned line mentions the field · a phantom has reads and no writes.
// RED CONTROLS: a made-up field → not known · a site whose line was changed after the scan is DROPPED and counted ·
//   an index with no site list beside it (the committed snapshot) → not known, never a guess.
// The generator cannot run → INCONCLUSIVE, never PASS.
// Command: node devtools/vscode/x0-navigator/tests/witness_x0_refs.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('../lib/app_surface_index');
const R = require('../lib/app_refs');
const F = require('../lib/surface_refresh');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SEC = '§';
let fail = 0;
function check(label, cond) { console.log('  ' + (cond ? 'PASS ' : 'FAIL ') + label); if (!cond) fail++; return !!cond; }
function summary(f, verdict) { console.log(SEC + 'X0_REFS ' + Object.keys(f).map(k => k + '=' + f[k]).join(' ') + ' verdict=' + verdict); }
const yn = b => (b ? 'Y' : 'N');

(async () => {
  const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'x0-refs-'));
  let run; try { run = await F.runOnce(ROOT, OUT); } catch (e) { console.log('  generator did not run: ' + e.message); summary({ generator: 'N' }, 'INCONCLUSIVE'); return; }
  const index = S.loadSurface(ROOT, run.file);
  const sites = R.loadSites(run.file);
  const sitesOk = check('the generator wrote a site list beside the fresh index (' + (sites ? Object.keys(sites.fields).length : 0) + ' fields, index ' + index.fields.size + ')',
    !!sites && Object.keys(sites.fields).length === index.fields.size);
  if (!sites) { summary({ sites: 'N' }, 'FAIL'); process.exitCode = 1; return; }

  const names = [...index.fields.keys()].sort();
  const step = Math.max(1, Math.floor(names.length / 60));
  const sample = names.filter((n, i) => i % step === 0);
  let same = 0, lineOk = 0, total = 0, dropped = 0; const bad = [];
  for (const n of sample) {
    const f = index.fields.get(n), r = R.references(ROOT, sites, n);
    const raw = sites.fields[n];
    const distinct = new Set(raw.w.map(x => x[0] + ':' + x[1]).concat(raw.r.map(x => x[0] + ':' + x[1]))).size;
    const countsOk = r.known && raw.w.length === f.writes && raw.r.length === f.reads && r.writes.length + r.reads.length + r.dropped === distinct;
    if (countsOk) same++; else bad.push(n);
    for (const s of r.writes.concat(r.reads)) {
      total++;
      const text = fs.readFileSync(s.abs, 'utf8').split('\n')[s.line - 1] || '';
      if (S.lineHasField(text, n) && text.charAt(s.column - 1) === '.') lineOk++;
    }
    dropped += r.dropped;
  }
  const countsOk = check('sampled ' + sample.length + ' fields: the site list holds exactly the writes and reads the index counted (' + same + ' agree' + (bad.length ? '; not: ' + bad.slice(0, 5).join(', ') : '') + ')', same === sample.length);
  const linesOk = check('every returned site (' + total + ') is a line that mentions the field, with the column on its dot (' + lineOk + ' ok, ' + dropped + ' dropped)', total > 0 && lineOk === total);
  const ph = names.find(n => index.fields.get(n).phantom && !index.fields.get(n).untied);
  const pr = R.references(ROOT, sites, ph);
  const phOk = check('a phantom (' + ph + ') has read sites (' + pr.reads.length + ') and no write site', pr.known && pr.writes.length === 0 && pr.reads.length > 0);

  // RED CONTROLS
  const unkOk = check('red control: a made-up field → not known, no sites', R.references(ROOT, sites, 'zzNotAField__').known === false);
  // a site whose line changed after the scan: the same list read against a copy of ONE file with a line inserted above
  const pick = sample.map(n => ({ n, r: R.references(ROOT, sites, n) })).find(x => x.r.writes.length === 1 && x.r.reads.length >= 1 && x.r.reads.every(s => s.file !== x.r.writes[0].file));
  let staleOk = null;
  if (!pick) console.log('  NOTE  no sampled field with one write in a file of its own: the moved-line control is not judged');
  else {
    const COPY = fs.mkdtempSync(path.join(os.tmpdir(), 'x0-refs-copy-'));
    const w = pick.r.writes[0];
    for (const s of pick.r.writes.concat(pick.r.reads)) { fs.mkdirSync(path.dirname(path.join(COPY, s.file)), { recursive: true }); fs.copyFileSync(s.abs, path.join(COPY, s.file)); }
    const lines = fs.readFileSync(path.join(COPY, w.file), 'utf8').split('\n');
    lines.splice(w.line - 1, 0, '// a line added after the scan');
    fs.writeFileSync(path.join(COPY, w.file), lines.join('\n'));
    const moved = R.references(COPY, sites, pick.n);
    const stillThere = moved.writes.some(s => s.line === w.line);
    staleOk = check('red control: ' + pick.n + ' — its write line moved after the scan → that site is dropped (' + moved.dropped + ' dropped), not returned at the old line; the reads in other files stay (' + moved.reads.length + ')',
      !stillThere && moved.dropped >= 1 && moved.reads.length === pick.r.reads.length);
    fs.rmSync(COPY, { recursive: true, force: true });
  }
  const noList = R.loadSites(path.join(ROOT, 'internal', 'APP_SURFACE.md'));
  const noListOk = check('red control: the committed index has no site list beside it → no references offered (never a guess)', noList === null && R.references(ROOT, noList, sample[0]).known === false);
  fs.rmSync(OUT, { recursive: true, force: true });
  summary({ fields: sample.length, counts_agree: yn(countsOk), sites: total, lines_ok: yn(linesOk), phantom_reads_only: yn(phOk), unknown: yn(unkOk),
    moved_line_dropped: staleOk === null ? '?' : yn(staleOk), no_list_no_guess: yn(noListOk), gen_ms: run.ms }, fail ? 'FAIL' : (sitesOk ? 'PASS' : 'INCONCLUSIVE'));
  if (fail) process.exitCode = 1;
})().catch(e => { console.log('  FAIL witness crashed: ' + (e && e.stack)); summary({ crashed: 'Y' }, 'FAIL'); process.exitCode = 1; });
