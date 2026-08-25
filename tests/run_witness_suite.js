#!/usr/bin/env node
/**
 * run_witness_suite.js — run EVERY viewer/tests/witness_*.js and print one verdict.
 *
 * Implementing bim-compiler prompts/SCRIPT_LENGTH_REFACTOR_SEAMS.md §S61.3 — Witness: W-SUITE-RUN
 *
 * WHY THIS EXISTS (the measured finding, not a preference). Every witness in this repo gates
 * correctly on its own — §S61.1 checked all 104 FAIL-printing files and found ZERO that fail to
 * exit nonzero. The defect was never the tests. It is that **nothing runs them together**, so a
 * red sits undiscovered until someone trips over it:
 *   - witness_zone_display_authoring.js was DEAD for 4 days (§S53.5), found only by auditing the
 *     consumers of a function that happened to be moved.
 *   - witness_big_element_support_coverage.js and witness_tm_geo_order_cycles.js are crashing on
 *     the same stale-slice class RIGHT NOW, and the first one crashes AFTER printing a PASS line,
 *     so eyeballing its head reads as healthy.
 * A red that nobody runs is indistinguishable from a test that does not exist.
 *
 * CONTRACT
 *   green      exit 0                      — counted as passing
 *   red        exit nonzero                — fails the suite UNLESS listed in KNOWN_RED
 *   timeout    killed at --timeout seconds — treated as red, never as a pass
 *   flaky      nonzero, then green on retry — reported as FLAKY, does NOT fail the suite
 *   new red    not in KNOWN_RED, red twice  — exit 1. THIS is what the runner is for.
 *   fixed      in KNOWN_RED but now green  — printed loudly, does NOT fail (never punish a fix);
 *                                            drain it from the list in the same PR that fixed it.
 *
 * TWO CLASSES, AND ONLY ONE OF THEM CAN GATE (measured over three full sweeps of a98b62c).
 * 21 of the 63 witnesses launch their own chromium + http server; 42 are headless node.
 * Across three sweeps the headless 42 gave the SAME verdict every time. The browser 21 gave a
 * different red set every time — run 1 flagged shakeout/pill_drawer_followup/disc_friendly_labels,
 * run 2 flagged corridor_reveal_shell (whose own log ended "ALL PASS"), run 3 flagged
 * role_filter/room_cycle_home/room_select_door, each failing twice in a row so --retries did not
 * absorb it. Every unstable file is browser-driven; not one headless file ever moved.
 * So: the headless class GATES (default). The browser class is quarantined behind --browser and
 * is REPORT-ONLY — it never fails the suite, because a verdict that changes per run cannot gate
 * anyone honestly. Fixing that contention is its own task; pretending it is signal is worse than
 * saying it out loud.
 *
 * FLAKINESS IS REAL AND WAS MEASURED, not anticipated: two full sweeps of the same commit
 * (a98b62c) 30 minutes apart disagreed on FOUR files — witness_disc_friendly_labels,
 * witness_pill_drawer_followup and witness_shakeout flipped red -> green, and
 * witness_corridor_reveal_shell flipped green -> red while its own log ended "ALL PASS".
 * Those witnesses each launch their OWN http server and chromium, so this is contention and
 * timing, not a missing service. A single run therefore cannot classify them, and a KNOWN_RED
 * list is the wrong instrument for a test that is not deterministic. Hence --retries: a red is
 * only believed when it reproduces.
 *
 * KNOWN_RED follows the house pattern already used by tests/audit_sw_precache.js (KNOWN_MISSING):
 * capture today's state WITH A STATED REASON so the suite is shippable on day one and gates
 * everything new. It is a triage queue, not a blessing — every entry is a real defect.
 *
 * USAGE
 *   node tests/run_witness_suite.js                  # all witnesses, sequential
 *   node tests/run_witness_suite.js --filter gantt   # only matching names (fast iteration)
 *   node tests/run_witness_suite.js --timeout 60     # per-file seconds (default 150)
 *   node tests/run_witness_suite.js --retries 0      # believe the first result (default 1 retry)
 *   node tests/run_witness_suite.js --browser        # ALSO run the 21 browser witnesses (report-only)
 *   node tests/run_witness_suite.js --list           # discover only, run nothing
 * Sequential on purpose: several witnesses drive a real browser against a fixed port, so parallel
 * runs would contend. Full sweep is ~15 min; use --filter while iterating.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TESTS_DIR = path.resolve(__dirname, '..', 'viewer', 'tests');
const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');

// ── KNOWN_RED — captured 2026-08-21 on origin/main a98b62c, real fleet DBs (§S61.3) ────────────
// Cause codes: A = stale-slice crash (a source-text slice of time_machine.js calls a module-scope
// helper the vm sandbox was never given — the §S53.5 class; §S58's support_sweep.js extraction
// retires it). B = hardcoded path. C = real product red. D = needs a live server/browser this run
// did not have — NOT proven healthy, just not proven red.
const KNOWN_RED = {
  // DRAINED 2026-08-22 (§S63) — all three were fixed and are green in the same PR that removed them:
  //   witness_tm_geo_order_cycles.js — the 8 -> 12 drift was BISECTED (18 runs over schedule_gate.js
  //     history), isolated to a2c30ee (#1345 §STAIR_FLIGHT_GRID_VISIBILITY) and MEASURED: the 4 added
  //     floaters are stair flights caught by the scheduler/audit asymmetry that commit deliberately
  //     left open, deficit 0.01d. Re-locked at 12 AND its class composition. Cause: 4D_SCHEDULE_PERFECTION §S63.
  //   witness_zone_index.js — was not a path bug: OLD is a prior REVISION, not a sibling file. Now
  //     derived from git at 475373b^, plus the two undeclared slice deps §S62 exposed. 5/5, 267,274
  //     elements compared across 7 buildings, mismatch=0.
  //   witness_zone_display_authoring.js — W-ZDA-4a re-locked to per-building baselines in
  //     baselines/midair.json (Duplex 22->37, HHS 894->1839). The inequality it replaced was
  //     permanently false, i.e. it gated nothing.
  // DRAINED 2026-08-24 (§TM_P6_FOLD PR):
  //   witness_gantt_lock_integrity.js — 20/20 green, verified twice AND against pristine
  //     origin/main (so an earlier merge fixed G-LI-2e, not this PR); entry was stale.
  // C — real assertion reds, reproducible every run.
  'witness_door_window_host_wall.js':        'C — assertion red, UNTRIAGED',
  'witness_gantt_props_epoch.js':            'C — W-PE-5/6/7 (4 of 20 checks) TRIAGED, not a live risk: updateStatus/' +
                                              '_finishActivate/the two jump diagnostics still literally format the TM\'s ' +
                                              'internal clock as a date, but every value reaching them is now clamped ' +
                                              'inside its real task window at the write site (injectGantt\'s ' +
                                              '_tmRescaleToTaskWindow, W-PE-8 in the same file proves it\'s wired; ' +
                                              'witness_tm_element_window_bind.js proves it works against real data). ' +
                                              'Fixing these 4 sites directly is a real follow-up (closes the pattern, not ' +
                                              'just the value) — see WITNESS_INTERFACE_FRAMEWORK.md §9.',
  'witness_4d_band_monotonic.js':            'C — T2a: 0->14,267 non-structure cross-storey inversions (Hospital), bisected to c972778 ' +
                                              '#1319 §HOSTED_BEFORE_HOST (0->9,171) then a2c30ee #1345 §STAIR_FLIGHT_GRID_VISIBILITY ' +
                                              '(->14,267). Newly wired in 2026-08-24 (was git-orphaned at repo root since fc58210, ' +
                                              'per §S66 — suite never ran it, so this went undetected). Cause: 4D_SCHEDULE_PERFECTION.md ' +
                                              '"REGRESSION FOUND" section.',
  // Reproducible reds whose cause has NOT been established. Labelled honestly rather than guessed:
  // an earlier pass called these "browser/server not up", which was wrong — both are headless.
  'witness_tm_stream_index_defer.js':        'C — reproducible red, cause NOT yet established',
  'witness_xray_cache_memo.js':              'C — reproducible red, cause NOT yet established',
  // D — environment/data, NOT a code defect: ~/bim-ootb/buildings/Duplex_meta.db is 0 bytes
  // (found 2026-08-25, both were green earlier the same day — pass=49/bad=0 — so this is a live
  // regression in the SHARED checkout's data, not stale). Fix = redownload/regenerate that one file
  // (see deploy/OCI_UPLOAD.md); nothing to change in either witness or in schedule_gate.js/S50.
  'witness_midair_zero.js':                  'D — Duplex_meta.db is 0 bytes in the shared checkout, not a code defect',
  'witness_s50_cell_engine.js':              'D — same root cause: Duplex_meta.db is 0 bytes in the shared checkout'
};

// The 21 browser witnesses are deliberately NOT listed here. They are report-only (see the header):
// a verdict that changes run to run cannot be captured in a static list without lying about it.

const args = process.argv.slice(2);
const argOf = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const FILTER = argOf('--filter', null);
const TIMEOUT_S = parseInt(argOf('--timeout', '150'), 10);
const LIST_ONLY = args.includes('--list');
const RETRIES = parseInt(argOf('--retries', '1'), 10);
const WITH_BROWSER = args.includes('--browser');

// Class by what the file DOES, not by a name convention that could drift.
const isBrowser = f => /chromium|playwright/.test(fs.readFileSync(path.join(TESTS_DIR, f), 'utf8'));

let files = fs.readdirSync(TESTS_DIR).filter(f => /^witness_.*\.js$/.test(f)).sort();
if (FILTER) files = files.filter(f => f.indexOf(FILTER) >= 0);
const browserFiles = files.filter(isBrowser);
if (!WITH_BROWSER) files = files.filter(f => !isBrowser(f));

if (LIST_ONLY) {
  files.forEach(f => console.log('  ' + f + (KNOWN_RED[f] ? '   [KNOWN_RED]' : '')));
  console.log('§SUITE_LIST ' + files.length + ' witnesses');
  process.exit(0);
}

console.log('§SUITE_START ' + files.length + ' witnesses (headless' + (WITH_BROWSER ? ' + browser, browser is REPORT-ONLY' : '; ' + browserFiles.length + ' browser witnesses skipped, use --browser') + '), timeout=' + TIMEOUT_S + 's');

// The witness's own verdict line, so the runner reports what the witness says — not a count it invented.
function summaryOf(out) {
  const m = String(out).match(/§[A-Z0-9_]*SUMMARY[^\n]*/g);
  return m ? m[m.length - 1].trim() : '';
}

let green = 0, newRed = 0, knownRed = 0, fixed = 0, flakyN = 0;
const newRedList = [], fixedList = [], flakyList = [];

function runOnce(f) {
  const r = spawnSync('node', [f], {
    cwd: TESTS_DIR, encoding: 'utf8', timeout: TIMEOUT_S * 1000,
    env: Object.assign({}, process.env, { BLD_DIR: BLD_DIR })
  });
  const timedOut = r.error && r.error.code === 'ETIMEDOUT';
  return { ok: !timedOut && r.status === 0, code: timedOut ? 'TIMEOUT' : r.status,
           out: (r.stdout || '') + (r.stderr || '') };
}

for (const f of files) {
  let r = runOnce(f);
  let flaky = false;
  // A red is only believed when it reproduces — see the FLAKINESS note in the header.
  for (let a = 0; !r.ok && a < RETRIES; a++) {
    const again = runOnce(f);
    if (again.ok) { flaky = true; r = again; break; }
    r = again;
  }
  const code = r.code;
  const ok = r.ok;
  const known = Object.prototype.hasOwnProperty.call(KNOWN_RED, f);
  const sum = summaryOf(r.out);

  if (flaky) {
    flakyN++; flakyList.push(f);
    console.log('  FLAKY ' + f + ' — failed then passed on retry, same commit. Not a red; not trustworthy either.' + (sum ? '   ' + sum : ''));
  } else if (ok && !known) { green++; console.log('  PASS  ' + f + (sum ? '   ' + sum : '')); }
  else if (ok && known) {
    fixed++; fixedList.push(f);
    console.log('  FIXED ' + f + ' — was KNOWN_RED, now green. Drain it from KNOWN_RED.' + (sum ? '   ' + sum : ''));
  } else if (known) {
    knownRed++; console.log('  known ' + f + ' (' + code + ') — ' + KNOWN_RED[f]);
  } else if (isBrowser(f)) {
    console.log('  brwsr ' + f + ' (' + code + ') — browser class, REPORT-ONLY, does not gate (verdict is not stable run to run)');
  } else {
    newRed++; newRedList.push(f + ' (' + code + ')');
    console.log('  RED   ' + f + ' (' + code + ')' + (sum ? '   ' + sum : ''));
  }
}

console.log('§SUITE_SUMMARY green=' + green + ' new_red=' + newRed + ' known_red=' + knownRed +
            ' fixed=' + fixed + ' flaky=' + flakyN + ' total=' + files.length);
if (flakyList.length) { console.log('§SUITE_FLAKY — same commit, different verdict per run'); flakyList.forEach(x => console.log('   ' + x)); }
if (newRedList.length) { console.log('§SUITE_NEW_RED'); newRedList.forEach(x => console.log('   ' + x)); }
if (fixedList.length) { console.log('§SUITE_FIXED — remove these from KNOWN_RED'); fixedList.forEach(x => console.log('   ' + x)); }
if (newRed > 0) process.exit(1);
