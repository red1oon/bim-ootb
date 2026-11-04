#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-SHED-UNCHANGED (prompts/DXF2BIM_ARCHITECT_REVIEW.md §D109; owner 2026-11-04: "as long remain backward compatible as done for Shed"). Read the log after every run: exit code is not evidence.
// Issue it exposes: every §D109 rule is a new default; one of them could change a set that already works. The Shed's bodies are pinned to the result of the code before §D109 (merge base 286f2ca8), field by field, by hash.
// The sheets are private local material: absent = SKIP, said loudly, nothing judged.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const SHD = process.env.SHED_SHEETS || path.join(os.homedir(), 'Projects/SYSNOVA/DXF2BIM/ShedDrawing/sheets/');
if (!fs.existsSync(path.join(SHD, '0_FLOOR_PLAN.dxf'))) { console.log('§W-SHED-UNCHANGED SKIP no Shed sheets at ' + SHD + ': nothing judged'); process.exit(0); }
const CLI = path.join(__dirname, '..', 'dxf2bim_cli.js'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shedpin-'));
const COMMON = ['--accept-suggestions', '--set', 'SHED', '--level', '0', '--datum', '1S_ELEV:0.6096@-4446.6', '--datum', '2_ELEV:0.6096@-4515.7264', '--datum', '7_ELEV:0.6096@-3766.442', '--layer', 'plan:Col=column', '--layer', 'elev:0=column@1S_ELEV', '--layer', 'plan:Fo=footing', '--layer', 'plan:Dim=beam@3_BEAM', '--layer', 'elev:Wall=panel@WEST', '--layer', 'elev:Wall=panel@EAST', '--exclude', '3_BEAM:-20880,-5600,-20845,-4950'];
const Z = ['--bodyz', 'footing=-1.4478,-1.143', '--bodyz', 'beam=3.098794,3.352794'];
const FILES = ['0_FLOOR_PLAN.dxf', '1S_ELEV_SOUTH.dxf', '3_BEAM_LAYOUT.dxf', '4_FOUNDATION_LAYOUT.dxf', '2_ELEV_WEST.dxf', '7_ELEV_EAST.dxf'].map(f => path.join(SHD, f));
// [name, arguments, bodies, sha256 of the sorted bodies at the merge base, first 16]
const PINS = [['heights stated', COMMON.concat(Z), 111, 'cd3975fcbfc03a05'], ['heights not stated (the rules that could fire do not)', COMMON, 61, 'd862979a216c112d']];
const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v);
let fails = 0;
PINS.forEach((p, i) => {
  const out = path.join(dir, 'r' + i), r = cp.spawnSync('node', [CLI, '--sheets'].concat(FILES, ['--out', out], p[1]), { encoding: 'utf8' });
  const b = r.status === 0 ? JSON.parse(fs.readFileSync(path.join(out, 'bodies.json'), 'utf8')) : null;
  const sha = b ? crypto.createHash('sha256').update(canon(b.slice().sort((x, y) => x.guid < y.guid ? -1 : 1))).digest('hex').slice(0, 16) : 'no run';
  const ok = b && b.length === p[2] && sha === p[3]; if (!ok) fails++;
  console.log((ok ? '§PASS ' : '§FAIL ') + 'SU' + (i + 1) + ' ' + p[0] + ': bodies ' + (b ? b.length : '-') + ' of ' + p[2] + ', hash ' + sha + ' of ' + p[3]);
});
fs.rmSync(dir, { recursive: true, force: true });
console.log('§W-SHED-UNCHANGED ' + (fails ? 'FAIL ' + fails : 'PASS') + ' judged=' + PINS.length);
process.exit(fails ? 1 : 0);
