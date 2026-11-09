#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — walk_cli.js: what the Modeller's discipline walker WOULD place, as counts (the verb modeller.walk; bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §0.13 item 2).
// READ THE §WALK lines (stderr) after every run; an exit code is not evidence. Witness: modeller/tests/witness_modeller_walk.js (W-MODELLER-WALK).
// A DRY walk: the model file's bytes are opened in memory, walked by the shipped walker in the page's own order (modeller/tools/walk_node.js walkLive), and closed. Nothing is written,
// exported or committed; the file's sha256 is printed before and after. No logic of the walk lives here:
//   the model      = the Modeller's Open list (modeller/buildings_manifest.json: building key -> its model file)
//   the rules      = common/walk_rules.js rulesDb(name), through walk_node.openBuildingRules (a residential building walks duplex_rules.db; docs/internal/WalkerDoctrine.md)
//   the walk       = walk_node.walkLive ; the tally = walk_node.summarize (every label is the walker's own field)
//   node modeller/tools/walk_cli.js --building Duplex --discipline FP
// Exit: 0 answered (verdict OK, or VACUOUS when the walk placed nothing: the door replies inconclusive) · 1 error (unknown building or discipline, named) · 2 usage.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..'), MOD = path.join(ROOT, 'modeller');
const say = (s) => process.stderr.write('§WALK ' + s + '\n');
const BREAK = () => process.env.WALK_BREAK || '';   // W-MODELLER-WALK falsifiers: plus1 | terminal
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

async function main(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) { const m = /^--(\w+)$/.exec(argv[i]); if (!m || i + 1 >= argv.length) { say('USAGE walk_cli.js --building B --discipline D'); return 2; } a[m[1]] = argv[++i]; }
  if (!a.building || !a.discipline) { say('USAGE walk_cli.js --building B --discipline D'); return 2; }
  const list = JSON.parse(fs.readFileSync(path.join(MOD, 'buildings_manifest.json'), 'utf8')).buildings, ent = list.filter(b => String(b.key).toLowerCase() === a.building.toLowerCase())[0];
  if (!ent) { say('FAIL unknown building "' + a.building + '" (the Modeller\'s Open list holds: ' + list.map(b => b.key).join(', ') + ')'); return 1; }
  const file = path.join(MOD, ent.db);
  if (!fs.existsSync(file) || fs.statSync(file).size < 10240) { say('FAIL the model file of ' + ent.key + ' (' + ent.db + ') is not in this checkout'); return 1; }
  // stdout carries only the answer: the walker's own § lines are kept (engineLines) and echoed to stderr
  const lines = [], realLog = console.log; console.log = function () { const s = Array.prototype.join.call(arguments, ' '); lines.push(s); process.stderr.write(s + '\n'); };
  try {
    const H = require('./walk_node.js');
    const SQL = await require(path.join(ROOT, 'common', 'lib', 'sql-wasm.js'))({ wasmBinary: fs.readFileSync(path.join(ROOT, 'common', 'lib', 'sql-wasm.wasm')) });
    const before = sha(file), stack = await H.loadStack(SQL);
    const sel = H.openBuildingRules(SQL, stack, BREAK() === 'terminal' ? 'forced_terminal_' + Date.now() : ent.key);
    const discs = stack.DW.disciplines(), disc = discs.filter(d => d.toLowerCase() === a.discipline.toLowerCase())[0];
    if (!disc) { say('FAIL unknown discipline "' + a.discipline + '" (the rules of ' + ent.key + ', ' + sel.rules + ', hold: ' + discs.join(', ') + ')'); return 1; }
    // the geometry file, by the fleet table's rule: passed with a resident model when the building's own <name>_geo.db is held
    const geoF = [process.env.VIEWER_BLD_DIR, path.join(ROOT, 'buildings'), path.join(os.homedir(), 'bim-ootb', 'buildings')].filter(Boolean).map(d => path.join(d, ent.key + '_geo.db')).filter(f => fs.existsSync(f) && fs.statSync(f).size > 10240)[0] || null;
    const geoDb = geoF ? new SQL.Database(new Uint8Array(fs.readFileSync(geoF))) : null;
    const t0 = Date.now(), w = H.walkLive(SQL, stack, disc, new Uint8Array(fs.readFileSync(file)), ent.key, [], geoDb ? { geoDb } : {}), S = H.summarize(w), after = sha(file);
    if (BREAK() === 'plus1') S.count += 1;
    const verdict = S.count > 0 ? 'OK' : 'VACUOUS';
    const summary = verdict === 'OK' ? 'the ' + disc + ' walk of ' + ent.key + ' would place ' + S.count + ' item' + (S.count === 1 ? '' : 's') + ' (' + S.provisional + ' provisional)' : 'the ' + disc + ' walk of ' + ent.key + ' placed nothing' + (S.reason ? ': ' + S.reason : '');
    const notChecked = ['a dry walk: nothing is committed to the model, so no edit check, clash gate against other disciplines\' live placements, or render ran'];
    if (!geoF) notChecked.push('no geometry file (' + ent.key + '_geo.db) is held here; the walk ran on the model file alone');
    const out = { verb: 'walk', building: ent.key, model: ent.db, rules: sel.rules, schedule: sel.schedule, borrowFP: sel.borrowFP, discipline: disc, geo: geoF ? path.basename(geoF) : null, verdict, summary,
      count: S.count, placed: S.placed, provisional: S.provisional, byClass: S.byClass, byHostState: S.byHostState, byProv: S.byProv, planOnly: S.planOnly, mode: S.mode, refused: S.refused, reason: S.reason,
      modelSha256: before, modelUnchanged: before === after, notChecked, engineLines: lines.filter(l => /§/.test(l)).slice(0, 80) };
    say('building=' + ent.key + ' model=' + ent.db + ' rules=' + sel.rules + ' discipline=' + disc + ' geo=' + (out.geo || 'none') + ' mode=' + S.mode + ' count=' + S.count + ' placed=' + S.placed + ' provisional=' + S.provisional + ' byClass=' + JSON.stringify(S.byClass) + ' verdict=' + verdict + ' ms=' + (Date.now() - t0) + (BREAK() ? ' WALK_BREAK=' + BREAK() : ''));
    say('model sha256 before=' + before.slice(0, 16) + ' after=' + after.slice(0, 16) + ' unchanged=' + (before === after));
    if (before !== after) { say('FAIL the model file changed during a dry walk'); return 1; }
    process.stdout.write(JSON.stringify(out) + '\n'); return 0;
  } catch (e) { say('FAIL ' + (e && e.message !== undefined ? e.message : String(e))); if (process.env.WALK_DEBUG) process.stderr.write(String(e && e.stack) + '\n'); return 1; }
  finally { console.log = realLog; }
}
if (require.main === module) main(process.argv.slice(2)).then(c => process.exit(c));
module.exports = { main };
