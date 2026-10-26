#!/usr/bin/env node
// ⚠ DO NOT REMOVE — the ALLWITNESS runner (prompts/DXF2BIM_FOUNDATION_LANE.md §3 (d)). Issue it proves or disproves: "green means everything ran". A witness that cannot run on this machine (missing generated inputs, no real sheets, no python module) is neither a pass nor invisible: it is listed, and the LIST is pinned in tests/witness_status_baseline.json, so a witness that STOPS running (or one that starts) changes the output and fails the run until a person looks.
// Runs every modeller/tests/witness_dxf_*.js plus witness_ifc_valid / witness_format / witness_standards_pack and viewer/tests/witness_info_dxf2bim.js. Each is PASS (rc 0, no FAIL line, no SKIP), SKIP (it printed §SKIP), ENV (it died on a missing input of this machine: ENOENT / MISSING input / a module under a bim-compiler checkout that is not here / an unopenable database) or FAIL (anything else). Exit 1 on any FAIL, and on any difference between the ENV + SKIP sets and the baseline (use --update after a person has read the difference).
// usage: NODE_PATH=~/bim-compiler/node_modules node modeller/tests/run_all_witnesses.js [--update] [--only <substring>]
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const T = __dirname, V = path.join(T, '..', '..', 'viewer', 'tests'), BASE = path.join(T, 'witness_status_baseline.json');
const upd = process.argv.includes('--update'), only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const files = fs.readdirSync(T).filter(f => /^witness_(dxf_.*|ifc_valid|format|standards_pack|ids)\.js$/.test(f)).sort().map(f => path.join(T, f)).concat([path.join(V, 'witness_info_dxf2bim.js')]).filter(f => !only || f.includes(only));
const ENVSIG = /ENOENT|MISSING input|Cannot find module '\/home\/[^']*\/(Projects\/)?bim-compiler|cannot be readonly|Received undefined|file is not a database|no such file or directory/;
// Inputs the db-argument witnesses take (Node model dbs from scripts/extractIFC2DB.js, regenerate them: see the RESUME block of prompts/DXF2BIM_ARCHITECT_REVIEW.md). A witness whose files all exist RUNS with them and is PASS or FAIL;
// one whose files are missing is ENV as before ("green means everything ran"). Built and stamped by modeller/tools/witness_dbs.js into ~/.cache/dxf2bim/db (§D79; DXF_DB_DIR overrides).
const WDB = require(path.join(T, '..', 'tools', 'witness_dbs.js')), INPUTS = { arrange: ['DXARC'], evidence: ['DXARC'], yellow_group: ['DXARC'], slab_edge: ['DXARC', 'HHSM2', 'JKR3'], bridge_long: ['CLINIC2'], curtain: ['HHSM2'], curtain_elev: ['HHSM2'], door_elev: ['CLINIC2'], door_swings: ['DXARC'], door_tag: ['DXARC'], exclude_std: ['DXARC'], level_datum: ['SCASTLE', 'DXARC'],
  north: ['DXARC'], quality: ['HHSM2'], recessed: ['CLINIC2'], section_cut: ['DXARC'], section_onlevel: ['DXARC'], sheet_view: ['DXARC'], sidecar: ['DXARC'], slab_estimate: ['HHSM2'], slab_level: ['JKR3'], slab_outline: ['HHSM2'], stairs: ['DXARC'],
  storey_absorb: ['JKR2'], tag_width: ['HHSM2'], valid: ['DXARC'], wall_line: ['DXARC'], walltop_default: ['HHSM2'], wand: ['DXARC'], win_tag_width: ['HHSM2'], window_angled: ['DXARC'], window_parts: ['JKR2'], window_schedule: ['DXARC'], wing_back: ['DXARC'], wing_vs_straight: ['DXARC'] };
// §D79: the inputs live in the stamped cache of modeller/tools/witness_dbs.js (~/.cache/dxf2bim/db, DXF_DB_DIR overrides); a db that is missing or no longer matches its
// sources is not fed to a witness: the witness is ENV with that reason and the command that fixes it.
const argsOf = name => { const k = INPUTS[name.replace(/^witness_dxf_/, '')]; if (!k) return []; const bad = k.filter(n => WDB.check(n) !== 'fresh');
  return bad.length ? { env: bad.map(n => n + ' ' + WDB.check(n)).join(', ') + ' (run: node modeller/tools/witness_dbs.js)' } : k.map(WDB.dbPath); };
const res = {};
files.forEach(f => {
  const name = path.basename(f, '.js'), a = argsOf(name);
  if (a.env) { res[name] = 'ENV'; console.log('ENV   ' + name + '  (input ' + a.env + ')'); return; }
  const t0 = Date.now(), r = cp.spawnSync('node', [f].concat(a), { encoding: 'utf8', timeout: 590000, env: process.env }), out = (r.stdout || '') + (r.stderr || '');
  const hasFail = /§FAIL|^FAIL|^\s*(❌|✗)| FAIL [1-9]/m.test(out) || /§W-[A-Z-]+ FAIL/.test(out), skip = /§SKIP/.test(out);
  let st; if (r.status === 0 && !hasFail) st = skip ? 'SKIP' : 'PASS'; else if (ENVSIG.test(out) && !hasFail) st = 'ENV'; else st = 'FAIL';
  res[name] = st; console.log((st + '    ').slice(0, 5) + ' ' + name + '  (' + ((Date.now() - t0) / 1000).toFixed(1) + 's' + (st !== 'PASS' ? ', ' + (out.split('\n').filter(l => /§SKIP|MISSING|Error|ENOENT|FAIL/.test(l))[0] || '').replace(/\s+/g, ' ').slice(0, 110) : '') + ')');
});
const counts = {}; Object.values(res).forEach(s => { counts[s] = (counts[s] || 0) + 1; });
console.log('§ALLWITNESS ' + Object.entries(counts).map(([k, v]) => k + '=' + v).join(' ') + ' of ' + files.length);
const pinned = Object.keys(res).filter(n => res[n] === 'ENV' || res[n] === 'SKIP').sort().map(n => n + ':' + res[n]);
if (upd) { fs.writeFileSync(BASE, JSON.stringify({ note: 'witnesses that cannot run on the build machine and why; a change here fails the runner until a person reads it', env_or_skip: pinned }, null, 1) + '\n'); console.log('§NOTE baseline written: ' + pinned.length + ' witnesses'); process.exit(counts.FAIL ? 1 : 0); }
const base = fs.existsSync(BASE) ? JSON.parse(fs.readFileSync(BASE, 'utf8')).env_or_skip : null, diff = base ? pinned.filter(x => !base.includes(x)).map(x => '+' + x).concat(base.filter(x => !pinned.includes(x) && (!only || x.includes(only))).map(x => '-' + x)) : ['(no baseline)'];
if (diff.length && !only) console.log('§FAIL the ENV/SKIP set changed: ' + diff.join(' '));
process.exit(counts.FAIL || (diff.length && !only) ? 1 : 0);
