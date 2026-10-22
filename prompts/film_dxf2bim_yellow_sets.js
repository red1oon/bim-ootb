#!/usr/bin/env node
// ⚠ DO NOT REMOVE — Scope: prompts/FILM_DXF2BIM_YELLOW_MARKINGS.md (set writer of the "Yellow until it is yours" film). Writes the Duplex standard set from THIS worktree's writer twice:
// <out>/marked = writeStdSet + deriveMarks (every marking @BY=model, what our own 3D-to-2D export hands over) and <out>/plain = writeStdSet alone (no DXF2BIM-MARK text: "a common CAD drawing").
// Prints §FILM_SETS; read it after every run (a plain sheet with a DXF2BIM-MARK layer, or a sheet count other than the marked one, is not a set for this film).
// usage: NODE_PATH=~/bim-compiler/node_modules node prompts/film_dxf2bim_yellow_sets.js <model db, e.g. /tmp/db2/DXARC.db> <out dir> [set name, default DUPLEX]
'use strict';
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const M = path.join(__dirname, '..', 'modeller'), D = path.join(M, 'dxf2bim');
const S = require(path.join(D, 'std2d.js')), Mk = require(path.join(D, 'std2d_marks.js')), MK = require(path.join(D, 'dxf2marks.js')), B = require(path.join(D, 'dxf2bim.js')), SHC = require(path.join(D, 'dxf2shell_config.js'));
const SC = require(path.join(D, 'std2d_scopes.js')), DxfParser = require(path.join(M, 'lib', 'dxf-parser.js'));
const Database = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const [db, outDir, name = 'DUPLEX'] = process.argv.slice(2);
if (!db || !outDir) { console.log('§FILM_SETS FAIL usage: <db> <out dir> [set name]'); process.exit(1); }
const con = new Database(db, { readonly: true }), q = s => con.prepare(s).all();
const R = S.writeStdSet(q, name);
const Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex: s => crypto.createHash('sha256').update(s).digest('hex'), MK, SHC, SCOPES: SC }, { set: name });
for (const d of ['marked', 'plain']) { fs.rmSync(path.join(outDir, d), { recursive: true, force: true }); fs.mkdirSync(path.join(outDir, d), { recursive: true }); }
let nm = 0, np = 0; const by = {};
for (const n of Object.keys(Dm.files)) { fs.writeFileSync(path.join(outDir, 'marked', n), Dm.files[n]); (Dm.files[n].match(/@BY=\w+/g) || []).forEach(x => { by[x] = (by[x] || 0) + 1; nm++; }); }
for (const n of Object.keys(R.files)) { fs.writeFileSync(path.join(outDir, 'plain', n), R.files[n]); if (/DXF2BIM-MARK/.test(R.files[n])) np++; }
const ns = Object.keys(Dm.files).length, ok = ns === Object.keys(R.files).length && np === 0 && ns > 0;
console.log('§FILM_SETS ' + (ok ? 'OK' : 'FAIL') + ' sheets=' + ns + ' marked_marks=' + nm + ' plain_marks=0 plain_with_mark_layer=' + np + ' by=' + JSON.stringify(by) + ' out=' + path.resolve(outDir));
process.exit(ok ? 0 : 1);
