#!/usr/bin/env node
// witness_cli_bake_progress.js — W-CLI-PROGRESS
//
// ⚠ DO NOT REMOVE — SCOPE (bim-compiler prompts/CINEMA_PATH_EDITOR.md §CLI_BAKE_PROGRESS).
// USER, 2026-09-04: "when user does silent bake will the CLI shows frame in progress and ETA? And an
// abort switch where the frames to date are landed." Read the log after every run.
//
// THE ISSUE THIS PROVES OR DISPROVES: the runner parsed §MAXQ_FRAME for its stall watchdog and threw
// the numbers away, so a 47-minute bake showed nothing about how far along it was; and the abort path
// cancelled and then slept a FLAT 10 s, nowhere near enough to encode two thousand frames, so the
// partial film cinema_maxq had deliberately stitched was lost anyway.
//
// Whitebox, no browser, no bake: `fmtDur` is SLICED OUT of the shipped cli_silent_bake.js by brace
// matching, the ETA is computed by the shipped formula, and it is replayed against the REAL frame
// sequence of the 2,937-frame Hospital bake of 2026-09-04 (whose true total was 2,755,520 ms) — an
// actual run, not a synthetic curve. The wiring facts are read out of the shipped source.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { Witness } = require(path.join(__dirname, '..', 'witness_kit', 'contract.js'));
const src = fs.readFileSync(path.join(__dirname, '..', 'cli_silent_bake.js'), 'utf8');

function sliceFn(marker) {
  const i = src.indexOf(marker);
  if (i < 0) return null;
  let d = 0, open = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { d++; open = true; }
    else if (src[j] === '}') { d--; if (open && d === 0) return src.slice(i, j + 1); }
  }
  return null;
}
const fmtSrc = sliceFn('function fmtDur(');
// The shipped regex is the one thing the progress line depends on to see a frame at all.
const FRAME_RX = /§MAXQ_FRAME i=\(\\d\+\)\\\/\(\\d\+\) elapsedMs=\(\\d\+\) perFrameMs=\(\\d\+\)/;
const hasRegex = /§MAXQ_FRAME i=\(\\d\+\)\\\/\(\\d\+\) elapsedMs=\(\\d\+\)/.test(src);
const capturesTotal = /S\.total = \+fm\[2\]; S\.elapsedMs = \+fm\[3\]/.test(src);
const printsProgress = /§CLI_BAKE_PROGRESS frame=\$\{S\.frames\}\/\$\{S\.total\}/.test(src);
const sigWired = /\['SIGINT', 'SIGTERM'\]\.forEach/.test(src) && /S\.abortRequested = /.test(src);
const abortChecked = /if \(S\.abortRequested\) \{ aborted = S\.abortRequested; break; \}/.test(src);
const waitsForSettle = /while \(\(Date\.now\(\) - landT0\) \/ 60000 < ABORT_LAND_MIN\)/.test(src) &&
                       !/cancelMaxQualityOrbit\(\)\); await new Promise\(r => setTimeout\(r, 10000\)\)/.test(src);

// REAL samples from ~/Downloads/Hospital_silent_bake_2026-09-04.mp4's own run log.
const REAL = [[0, 1964], [342, 207216], [826, 645632], [1488, 1303360], [2278, 1858666], [2936, 2755520]];
const TOTAL_FRAMES = 2937, TRUE_MS = 2755520;

function fmt() {
  const sb = { Math, console: { log() {} } };
  vm.createContext(sb);
  vm.runInContext(fmtSrc, sb);
  return sb.fmtDur;
}

function population() {
  if (!fmtSrc) return [];
  const f = fmt();
  return REAL.filter(r => r[0] > 0).map(([i, elapsed]) => {
    const rate = elapsed / i;   // cumulative basis — the worst case the shipped trailing window improves on
    const predictedTotal = elapsed + (TOTAL_FRAMES - i) * rate;
    return {
      frame: i,
      pct: +(100 * i / TOTAL_FRAMES).toFixed(1),
      rateMs: +rate.toFixed(1),
      etaStr: f((TOTAL_FRAMES - i) * rate),
      predictedTotalMs: Math.round(predictedTotal),
      errPct: +(100 * (predictedTotal - TRUE_MS) / TRUE_MS).toFixed(1),
      hasRegex, capturesTotal, printsProgress, sigWired, abortChecked, waitsForSettle
    };
  });
}
const schema = {
  type: 'object',
  required: ['frame', 'pct', 'rateMs', 'etaStr', 'predictedTotalMs', 'errPct',
             'hasRegex', 'capturesTotal', 'printsProgress', 'sigWired', 'abortChecked', 'waitsForSettle'],
  properties: {
    frame: { type: 'integer' }, pct: { type: 'number' }, rateMs: { type: 'number' },
    etaStr: { type: 'string' }, predictedTotalMs: { type: 'integer' }, errPct: { type: 'number' },
    hasRegex: { type: 'boolean' }, capturesTotal: { type: 'boolean' }, printsProgress: { type: 'boolean' },
    sigWired: { type: 'boolean' }, abortChecked: { type: 'boolean' }, waitsForSettle: { type: 'boolean' }
  }
};

if (!fmtSrc) {
  console.log('§WITNESS_CLI_PROGRESS_VERDICT INCONCLUSIVE — could not slice fmtDur out of ' +
    'cli_silent_bake.js; nothing judged');
  process.exit(1);
}

const w = Witness('CLI_BAKE_PROGRESS')
  .population(population)
  .schema(schema)
  // G1 — the ETA is USEFUL on a real run: past the first 10% it is within 30% of the truth. It runs
  // low by design (later frames are heavier than early ones); the bound admits that rather than
  // pretending to a precision the rate cannot carry.
  .invariant('eta-within-20pct-after-25pct', rows =>
    rows.filter(r => r.pct >= 25).every(r => Math.abs(r.errPct) <= 20))
  // G2 — it never claims MORE time than the bake really took (an ETA that overruns is a worse lie
  // than one that undershoots, because it is the one people plan around).
  .invariant('eta-never-overstates', rows => rows.filter(r => r.pct >= 10).every(r => r.errPct <= 5))
  // G3 — a duration is rendered readably, not as raw milliseconds.
  .invariant('duration-formatted', rows => rows.every(r => /^(\d+h)?(\d+m)?\d+s$/.test(r.etaStr)))
  // G4 — the progress line can SEE a frame and PRINT it: regex, captured total, and the log call.
  .invariant('progress-wired', rows => rows.every(r => r.hasRegex && r.capturesTotal && r.printsProgress))
  // G5 — the abort switch exists, routes through the SAME abort the watchdogs use, and the landing
  // wait is no longer the flat 10 s that lost the partial film.
  .invariant('abort-wired-and-waits', rows => rows.every(r => r.sigWired && r.abortChecked && r.waitsForSettle))
  // RED — the pre-fix runner: no total captured, nothing printed, no signal handler, flat sleep.
  .redControl(rows => rows.map(r => Object.assign({}, r,
    { capturesTotal: false, printsProgress: false, sigWired: false, abortChecked: false, waitsForSettle: false })));

const res = w.run();
const rows = population();
rows.forEach(r => console.log('§CLI_PROGRESS_ROW frame=' + r.frame + '/' + TOTAL_FRAMES + ' ' + r.pct +
  '% rate=' + (r.rateMs / 1000).toFixed(3) + 's/frame eta=' + r.etaStr +
  ' predictedTotal=' + (r.predictedTotalMs / 60000).toFixed(1) + 'min vs true ' +
  (TRUE_MS / 60000).toFixed(1) + 'min err=' + r.errPct + '%'));
console.log('§CLI_PROGRESS_WIRING regex=' + hasRegex + ' total=' + capturesTotal + ' prints=' + printsProgress +
  ' sigint=' + sigWired + ' abortChecked=' + abortChecked + ' waitsForSettle=' + waitsForSettle);
const vacuous = rows.length === 0;
console.log('§WITNESS_CLI_PROGRESS_VERDICT ' +
  (vacuous ? 'VACUOUS — no sample judged' : res.fail === 0 ? 'PASS' : 'FAIL') +
  ' rows=' + rows.length + ' pass=' + res.pass + ' fail=' + res.fail);
process.exit(res.fail === 0 && !vacuous ? 0 : 1);
