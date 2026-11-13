#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-X0-FRESH (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.5, decision F-10,
// issue #2924). Read the log after every run: exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "a field moved since the index was committed shows 'index stale' instead of
//   its definition" — X0 must answer from its own fresh copy, made by the repo's own generator, without ever
//   writing inside the repo.
// POPULATION: (1) a fixture repo in a temp folder: the REAL generator + its tokenizer copied in, one module that
//   writes one field, then a line inserted above the write; (2) the real repo, every written field.
// RED CONTROL: the fixture's committed (now old) index must resolve the moved field as `stale` — that is the
//   defect, shown to exist before the fix is judged. If it does not, the witness judged nothing → INCONCLUSIVE.
// Generator missing → INCONCLUSIVE, never PASS.
// Command: node devtools/vscode/x0-navigator/tests/witness_x0_fresh.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const S = require('../lib/app_surface_index');
const R = require('../lib/surface_refresh');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const sha = f => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
let fail = 0;
function check(label, cond) { console.log('  ' + (cond ? 'PASS ' : 'FAIL ') + label); if (!cond) fail++; }
function summary(f, verdict) {
  console.log('§X0_FRESH ' + Object.keys(f).map(k => k + '=' + f[k]).join(' ') + ' verdict=' + verdict);
}

if (!fs.existsSync(path.join(ROOT, R.GENERATOR))) {
  console.log('  generator not found: ' + R.GENERATOR);
  summary({ before: '?', after: '?' }, 'INCONCLUSIVE');
  process.exit(0);
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'x0-fresh-'));
const FIX = path.join(TMP, 'repo'), OUT = path.join(TMP, 'store'), REAL_OUT = path.join(TMP, 'real');
// The fixture module is assembled from pieces: this file must add no field to the real index.
const FIELD = 'x0FreshProbe';
const moduleSrc = ['function setup' + 'Probe(' + 'A) {', '  A' + '.' + FIELD + ' = 1;', '}', ''];

(async () => {
  // ── 1. fixture repo: commit an index, then move the field ──
  fs.mkdirSync(path.join(FIX, 'scripts', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(FIX, 'viewer'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, R.GENERATOR), path.join(FIX, R.GENERATOR));
  fs.copyFileSync(path.join(ROOT, 'scripts', 'lib', 'js_scan.js'), path.join(FIX, 'scripts', 'lib', 'js_scan.js'));
  const mod = path.join(FIX, 'viewer', 'probe.js');
  fs.writeFileSync(mod, moduleSrc.join('\n'));
  await R.runOnce(FIX, path.join(FIX, 'internal'));              // the "committed" index
  const committed = path.join(FIX, 'internal', R.OUT_NAME);
  const committedSha = sha(committed);
  const before0 = S.resolve(S.loadSurface(FIX), FIELD);
  check('fixture: the committed index resolves the field while it is current (line ' + (before0 && before0.line) + ')',
    !!before0 && before0.kind === 'definition' && before0.line === 2);
  fs.writeFileSync(mod, ['// a line added above the write', ''].concat(moduleSrc).join('\n'));   // the field moves 2 → 4

  const before = S.resolve(S.loadSurface(FIX), FIELD);
  const redSeen = !!before && before.kind === 'stale';
  check('red control (the defect): after the edit the committed index says `stale`, no jump', redSeen && !before.abs);

  // ── 2. refresh into a private folder ──
  const ref = R.createRefresher(FIX, OUT);
  const r1 = await ref.refresh();
  const after = S.resolve(S.loadSurface(FIX, r1.file), FIELD);
  const lineOk = !!after && after.kind === 'definition' && after.line === 4
    && S.lineHasField(fs.readFileSync(after.abs, 'utf8').split('\n')[after.line - 1], FIELD);
  check('fresh copy resolves the field at its NEW line (4), and that line mentions it', lineOk);
  check('the fresh copy lives outside the repo', r1.file.startsWith(OUT) && !r1.file.startsWith(FIX));

  // ── 3. the committed index is not touched ──
  const untouchedFix = sha(committed) === committedSha;
  check('fixture: the committed index is byte-identical after the refresh', untouchedFix);

  // ── 5. overlapping calls share one follow-up run ──
  const runs0 = ref.runs();
  const [a, b, c] = [ref.refresh(), ref.refresh(), ref.refresh()];
  await Promise.all([a, b, c]);
  const burst = ref.runs() - runs0;
  check('3 overlapping refresh() calls → at most 2 generator runs (n=' + burst + ')', burst >= 1 && burst <= 2 && b === c);
  let rejected = false;
  try { await R.runOnce(path.join(TMP, 'no-such-repo'), OUT); } catch (e) { rejected = true; }
  check('a root with no generator rejects (the caller falls back to the committed copy)', rejected);

  // ── 4. the real repo ──
  const realCommitted = path.join(ROOT, 'internal', R.OUT_NAME);
  const realSha = fs.existsSync(realCommitted) ? sha(realCommitted) : null;
  const rr = await R.runOnce(ROOT, REAL_OUT);
  const real = S.loadSurface(ROOT, rr.file);
  let def = 0, stale = 0, phantom = 0;
  for (const n of real.fields.keys()) {
    const x = S.resolve(real, n);
    if (x.kind === 'definition') def++; else if (x.kind === 'stale') stale++; else phantom++;
  }
  console.log('  real repo: ' + rr.line + ' gen_ms=' + rr.ms);
  check('real repo: every written field in the fresh copy resolves (definition=' + def + ' stale=' + stale + ')', def > 0 && stale === 0);
  const untouchedReal = realSha !== null && sha(realCommitted) === realSha;
  check('real repo: the tracked internal/' + R.OUT_NAME + ' is byte-identical after the refresh', untouchedReal);
  // For information: what the committed copy would have answered today.
  let cStale = 0;
  const cIdx = S.loadSurface(ROOT);
  if (cIdx) for (const n of cIdx.fields.keys()) if (S.resolve(cIdx, n).kind === 'stale') cStale++;
  console.log('§X0_FRESH_COMMITTED fields=' + (cIdx ? cIdx.fields.size : 0) + ' stale=' + cStale + ' (the committed snapshot, for information)');

  fs.rmSync(TMP, { recursive: true, force: true });
  const fields = {
    before: before ? before.kind : 'none', after: after ? after.kind : 'none', line_ok: lineOk ? 'Y' : 'N',
    committed_untouched: untouchedFix && untouchedReal ? 'Y' : 'N', real_fields: real.fields.size, real_stale: stale,
    runs: burst, gen_ms: rr.ms
  };
  if (!redSeen) { summary(fields, 'INCONCLUSIVE'); return; }
  summary(fields, fail === 0 ? 'PASS' : 'FAIL');
  if (fail) process.exitCode = 1;
})().catch(e => {
  console.log('  FAIL witness crashed: ' + (e && e.message));
  summary({ before: '?', after: '?' }, 'FAIL');
  process.exitCode = 1;
});
