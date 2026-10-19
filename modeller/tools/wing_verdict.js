#!/usr/bin/env node
// ⚠ DO NOT REMOVE — read-only probe (prompts/DXF2BIM_FOUNDATION_LANE.md F6). Writes the standard set of a Node-schema model .db as ONE WING (angle family FI, default 0 = the largest) in memory, reads it back with the Modeller's own importer and prints the verdict codes with counts, then every non-library blocking message once. READ THE OUTPUT, not the exit code.
// usage: NODE_PATH=<better-sqlite3 dir> FI=<family index> node modeller/tools/wing_verdict.js <model.db>      (no FI = family 0; FI=none = whole building straight)
'use strict';
const path = require('path'), crypto = require('crypto');
const M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js'));
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
const con = new Database(process.argv[2], { readonly: true }), q = s => con.prepare(s).all();
const m0 = S.loadModel(q, { add() {}, gap() {} }), fam = S.wingAngles(m0);
console.log('walls=' + m0.walls.length + ' angle families=' + JSON.stringify(fam));
const opts = process.env.FI === 'none' || !fam.length ? undefined : { wing: { angle: fam[Number(process.env.FI || 0)].deg, name: 'W' } };
const R = S.writeStdSet(q, 'X', opts), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC }, { set: 'X' });
const sheets = I.readSheets(Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] }))), out = I.convert(sheets, {}), v = out.verdict;
if (!v) { console.log('REFUSED ' + JSON.stringify(out.refused || out).slice(0, 400)); process.exit(1); }
const c = {}; v.blocking.forEach(b => { c[b.code] = (c[b.code] || 0) + 1; });
const lib = (c['GAP:lod400_library_unreachable'] || 0) + (c['GAP:no_host_cut'] || 0) + (c['GAP:opening_unclassified'] || 0);
console.log('blocking=' + v.blocking.length + ' (library-bound ' + lib + ', engine ' + (v.blocking.length - lib) + ')'); console.log(JSON.stringify(c));
const seen = {}; v.blocking.forEach(b => { if (/lod400|no_host_cut/.test(b.code) || seen[b.code]) return; seen[b.code] = 1; console.log('  ' + b.code + ': ' + b.message.slice(0, 200)); });
