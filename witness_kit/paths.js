// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part E, "E0 BUILD SPEC" (witness_kit/paths.js).
// ISSUE: 326 of 1,320 witness files hard-code /home/red1/… (measured on main b9b2e522), so they break on any other machine and, run in a
//   /tmp/wt-* worktree, read the SHARED checkout instead of the tree under test. This is the ONE place a witness asks "where is X".
// WHAT:  roots and named outside inputs, resolved from (1) this file's own location, (2) an env variable, (3) today's default folder.
//        Dev-side only, no dependency, prints nothing; nothing here reaches the browser. E0 edits no existing witness: converting the
//        326 files is a later mechanical step (Part E, after decision E-1).
// USE:   const P = require('<rel>/witness_kit/paths.js');  P.ootb('viewer', 'x.js') · P.compiler('deploy') · P.nodeModule('sql.js') ·
//        P.input('shed_marked') · P.need(P.input('civil_ifc'), 'the civil works IFC')
// Witness: witness_kit/tests/witness_paths.js (W-PATHS).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

const OOTB = path.resolve(__dirname, '..');   // the tree this file lives in: a worktree resolves to itself
const home = (...p) => path.join(os.homedir(), ...p);

/** Named inputs that live outside both repos: env variables first (in order), then today's default folder. */
const INPUTS = {
  shed_raw: { env: ['SHED_RAW_DIR'], def: () => home('Videos', 'dxf2bim_film_work', 'why', 'raw') },
  shed_marked: { env: ['SHED_MARKED_DIR', 'SHED_MARKED'], def: () => home('Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked') },
  civil_ifc: { env: ['BLD_DIR'], def: () => home('Downloads', 'JALAN JELAPANG IFC') },
  // the extracted building DBs are untracked: they live in the shared checkout, not in a worktree
  buildings: { env: ['BUILDINGS_DIR'], def: () => home('bim-ootb', 'buildings') },
};

/** The bim-ootb tree under test (this file's tree). */
function ootb(...p) { return path.join(OOTB, ...p); }
/** The bim-compiler checkout: $BIM_COMPILER_ROOT, else ~/bim-compiler. */
function compiler(...p) { return path.join(process.env.BIM_COMPILER_ROOT ? path.resolve(process.env.BIM_COMPILER_ROOT) : home('bim-compiler'), ...p); }
/** ~/.cache/<name>/… */
function cache(name, ...p) { return home('.cache', name, ...p); }
/** A named outside input (INPUTS): the first env variable that is set, else the default folder. Unknown names throw. */
function input(name, ...p) {
  const d = INPUTS[name];
  if (!d) throw new Error('paths.input: unknown input "' + name + '" (known: ' + Object.keys(INPUTS).join(', ') + ')');
  const e = d.env.find(k => process.env[k]);
  return path.join(e ? path.resolve(process.env[e]) : d.def(), ...p);
}
/** Where witnesses load node modules from today, in this order: the tree's own installs, then the shared checkout's (an install is per
 *  machine, not tree content: a /tmp/wt-* worktree has no tests/node_modules — measured, W-PATHS row playwright), then bim-compiler's. */
const moduleDirs = () => [...new Set([ootb('node_modules'), ootb('tests', 'node_modules'), home('bim-ootb', 'node_modules'), home('bim-ootb', 'tests', 'node_modules'), compiler('node_modules')])];
/** The folder of an installed node module, from the first of moduleDirs() that holds it; none -> throws naming every folder tried. */
function nodeModule(name) {
  for (const d of moduleDirs()) { const p = path.join(d, name); if (fs.existsSync(p)) return p; }
  throw new Error('MISSING input node module "' + name + '": not in ' + moduleDirs().join(', '));
}
/** The path itself, or an error whose message starts "MISSING input" (modeller/tests/run_all_witnesses.js reads that as ENV). */
function need(p, why) {
  if (!fs.existsSync(p)) throw new Error('MISSING input ' + p + (why ? ' (' + why + ')' : ''));
  return p;
}
/** The resolved table, for a witness or a session to print. */
function describe() {
  const t = { ootb: ootb(), compiler: compiler(), moduleDirs: moduleDirs() };
  for (const k of Object.keys(INPUTS)) t['input.' + k] = input(k);
  return t;
}

module.exports = { ootb, compiler, home, cache, input, nodeModule, need, describe, moduleDirs, INPUTS };
