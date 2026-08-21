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
  'witness_big_element_support_coverage.js': 'A — ReferenceError: _zoneIndex is not defined, crashes AFTER its first PASS line',
  'witness_tm_geo_order_cycles.js':          'A — ReferenceError: _zoneIndex is not defined, after §TMREPRO_SLICE',
  'witness_zone_index.js':                   'B — ENOENT, hardcodes /tmp/vw/time_machine.js instead of resolving from __dirname',
  'witness_isolate_zoom_2026-07-12.js':      'C — real red in a live browser: Parts axis reachable via toggle, axis=disc',
  'witness_gantt_lock_integrity.js':         'C — G-LI-2e, self-declared KNOWN PRE-EXISTING BUG in its own assert message',
  'witness_zone_display_authoring.js':       'C — W-ZDA-4a x2, floating worse under display-authored windows (§S53.5, decision pending)',
  'witness_door_window_host_wall.js':        'C — assertion red, untriaged',
  'witness_scene_merge_2026-07-30.js':       'C — assertion red, untriaged',
  'witness_disc_friendly_labels_2026-07-12.js': 'D/C — untriaged',
  'witness_find_close_no_leak_2026-07-26.js':   'D/C — untriaged',
  'witness_find_panel_hidden_onload_2026-07-11.js': 'D/C — untriaged',
  'witness_hba_cctv_inscene_capture.js':     'D/C — untriaged',
  'witness_hba_iot_lod_device_meshes.js':    'D/C — untriaged',
  'witness_hba_outline_panel_fixes.js':      'D/C — untriaged',
  'witness_hba_pill_desync_fix.js':          'D/C — untriaged',
  'witness_iot_pov_live.js':                 'D/C — untriaged',
  'witness_pill_drawer_followup_2026-07-06.js':        'D/C — untriaged',
  'witness_pill_drawer_mobile_position_2026-07-11.js': 'D/C — untriaged',
  'witness_room_box_purple_2026-07-12.js':   'D/C — untriaged',
  'witness_shakeout_2026-07-06.js':          'D — page.goto: Timeout 30000ms, needs the viewer served',
  'witness_tm_stream_index_defer.js':        'D — browser/server not up in this run',
  'witness_xray_cache_memo.js':              'D — browser/server not up in this run',
  'witness_class_outline_live.js':           'D — exceeded 150s, needs a live browser',
  'witness_panel_abstraction.js':            'D — exceeded 150s, needs a live browser'
};

const args = process.argv.slice(2);
const argOf = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const FILTER = argOf('--filter', null);
const TIMEOUT_S = parseInt(argOf('--timeout', '150'), 10);
const LIST_ONLY = args.includes('--list');
const RETRIES = parseInt(argOf('--retries', '1'), 10);

let files = fs.readdirSync(TESTS_DIR).filter(f => /^witness_.*\.js$/.test(f)).sort();
if (FILTER) files = files.filter(f => f.indexOf(FILTER) >= 0);

if (LIST_ONLY) {
  files.forEach(f => console.log('  ' + f + (KNOWN_RED[f] ? '   [KNOWN_RED]' : '')));
  console.log('§SUITE_LIST ' + files.length + ' witnesses');
  process.exit(0);
}

console.log('§SUITE_START ' + files.length + ' witnesses, timeout=' + TIMEOUT_S + 's, BLD_DIR=' + BLD_DIR);

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
