#!/usr/bin/env node
// witness_cli_bake_flag_override.js — W-CLI-FLAGS
//
// ⚠ DO NOT REMOVE — SCOPE (bim-compiler prompts/CINEMA_PATH_EDITOR.md §CLI_BAKE_FLAG_OVERRIDE).
// USER, 2026-09-04: "when user saves alt-c setting in path in the DB, during silent bake, user need
// not pass any argument further and use the stored path settings. Of course user may still pass args
// to overwrite those settings." Read the log after every run.
//
// THE ISSUE THIS PROVES OR DISPROVES: the command line must be THREE-state, not two. A flag left off
// has to stay `undefined` so the saved path's own value survives __maxqBake's merge; forcing `false`
// would silently overwrite a saved buildup=1 with off, which is exactly what "pass no argument" must
// never mean. And an override has to be able to turn a saved setting OFF, which before --no-* it
// could not — the command line could only ever ADD features.
//
// Whitebox, no browser, no bake: `triState` is SLICED OUT of the shipped cli_silent_bake.js by brace
// matching and driven with real argv shapes; the merge rule and the prime gate are read out of the
// shipped cinema_maxq.js / cli_silent_bake.js rather than restated here.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { Witness } = require(path.join(__dirname, '..', 'witness_kit', 'contract.js'));

const cliSrc = fs.readFileSync(path.join(__dirname, '..', 'cli_silent_bake.js'), 'utf8');
const maxqSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'cinema_maxq.js'), 'utf8');

function sliceFn(src, marker) {
  const i = src.indexOf(marker);
  if (i < 0) return null;
  let d = 0, open = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { d++; open = true; }
    else if (src[j] === '}') { d--; if (open && d === 0) return src.slice(i, j + 1); }
  }
  return null;
}
const triSrc = sliceFn(cliSrc, 'function triState(');
// __maxqBake must merge only DEFINED keys, or the tri-state is pointless downstream.
const mergeGuard = /if \(o\.flags\[fk\] !== undefined\) ov\[fk\] = o\.flags\[fk\];/.test(maxqSrc);
// The Time Machine prime must be gated on the RESOLVED answer, not on the raw CLI flag.
const primeOnResolved = /if \(willBuildup\.on\) \{/.test(cliSrc) &&
                        !/if \(FLAGS\.buildup\) \{/.test(cliSrc);

function triFor(argvList) {
  const sb = { argv: argvList, console: { log() {} } };
  vm.createContext(sb);
  vm.runInContext(
    'function has(name) { return argv.indexOf("--" + name) >= 0; }\n' + triSrc +
    '\nvar _r = { buildup: triState("buildup","no-buildup"), label: triState("label","no-label"),' +
    ' reveal: triState("reveal","no-reveal") };', sb);
  return sb._r;
}
function kind(v) { return v === undefined ? 'undef' : String(v); }

// What the bake ends up with, applying the SHIPPED merge rule to a stored path.
function merged(storedOn, cli) {
  return cli === undefined ? storedOn : cli;
}

const CASES = [
  { name: 'no-args-stored-on', argv: [], storedBuildup: true },
  { name: 'no-args-stored-off', argv: [], storedBuildup: false },
  { name: 'force-on-over-stored-off', argv: ['--buildup'], storedBuildup: false },
  { name: 'force-off-over-stored-on', argv: ['--no-buildup'], storedBuildup: true },
  { name: 'both-flags-off-wins', argv: ['--buildup', '--no-buildup'], storedBuildup: true }
];

function population() {
  if (!triSrc) return [];
  return CASES.map(c => {
    const t = triFor(c.argv);
    return {
      scenario: c.name,
      argv: c.argv.join(' ') || '(none)',
      cliBuildup: kind(t.buildup),
      cliLabel: kind(t.label),
      cliReveal: kind(t.reveal),
      storedBuildup: c.storedBuildup,
      effectiveBuildup: !!merged(c.storedBuildup, t.buildup),
      mergeGuard: mergeGuard,
      primeOnResolved: primeOnResolved
    };
  });
}

const schema = {
  type: 'object',
  required: ['scenario', 'argv', 'cliBuildup', 'cliLabel', 'cliReveal', 'storedBuildup',
             'effectiveBuildup', 'mergeGuard', 'primeOnResolved'],
  properties: {
    scenario: { type: 'string' }, argv: { type: 'string' }, cliBuildup: { type: 'string' },
    cliLabel: { type: 'string' }, cliReveal: { type: 'string' }, storedBuildup: { type: 'boolean' },
    effectiveBuildup: { type: 'boolean' }, mergeGuard: { type: 'boolean' },
    primeOnResolved: { type: 'boolean' }
  }
};

if (!triSrc) {
  console.log('§WITNESS_CLI_BAKE_FLAGS_VERDICT INCONCLUSIVE — could not slice triState out of ' +
    'cli_silent_bake.js; nothing judged');
  process.exit(1);
}

const w = Witness('CLI_BAKE_FLAG_OVERRIDE')
  .population(population)
  .schema(schema)
  // G1 — the user's headline: no arguments at all means the saved path decides, either way.
  .invariant('absent-flag-defers-to-stored', rows => rows
    .filter(r => r.argv === '(none)')
    .every(r => r.cliBuildup === 'undef' && r.effectiveBuildup === r.storedBuildup))
  // G2 — an override can still turn a feature ON over a saved off.
  .invariant('cli-can-force-on', rows => {
    const r = rows.find(x => x.scenario === 'force-on-over-stored-off');
    return !!r && r.cliBuildup === 'true' && r.effectiveBuildup === true;
  })
  // G3 — and OFF over a saved on, which was impossible before --no-*.
  .invariant('cli-can-force-off', rows => {
    const r = rows.find(x => x.scenario === 'force-off-over-stored-on');
    return !!r && r.cliBuildup === 'false' && r.effectiveBuildup === false;
  })
  // G4 — the tri-state only means anything if the shipped merge skips undefined keys.
  .invariant('shipped-merge-skips-undefined', rows => rows.every(r => r.mergeGuard === true))
  // G5 — the Time Machine prime follows the RESOLVED answer, so a stored-path buildup is primed
  // even with no flag on the command line (the case that reached a bake with no timeline).
  .invariant('prime-gated-on-resolved', rows => rows.every(r => r.primeOnResolved === true))
  // RED — the pre-fix two-state parse: absent means false, and off is unreachable.
  .redControl(rows => rows.map(r => Object.assign({}, r, {
    cliBuildup: r.cliBuildup === 'true' ? 'true' : 'false',
    effectiveBuildup: r.cliBuildup === 'true',
    primeOnResolved: false
  })));

const res = w.run();
const rows = population();
rows.forEach(r => console.log('§CLI_BAKE_FLAGS_ROW ' + r.scenario + ' argv="' + r.argv +
  '" cli.buildup=' + r.cliBuildup + ' stored=' + r.storedBuildup + ' effective=' + r.effectiveBuildup));
console.log('§CLI_BAKE_FLAGS_WIRING mergeGuardPresent=' + mergeGuard + ' primeGatedOnResolved=' + primeOnResolved);
const noop = rows.every(r => r.cliBuildup !== 'undef');
console.log('§WITNESS_CLI_BAKE_FLAGS_VERDICT ' +
  (rows.length === 0 ? 'VACUOUS — no case judged'
   : noop ? 'NO-OP — no case ever produced an undefined flag; the tri-state is not in force'
   : res.fail === 0 ? 'PASS' : 'FAIL') +
  ' rows=' + rows.length + ' pass=' + res.pass + ' fail=' + res.fail);
process.exit(res.fail === 0 && rows.length > 0 && !noop ? 0 : 1);
