#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — gen_bc_model.js: EXTRACTS the Dynamics 365 Business Central data model the "Migrate from Business Central" converter needs, from Microsoft's own
//   published source (github.com/microsoft/BCApps, MIT), pinned to one commit. Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §BC-SPEC — Witness: W-BC-MODEL.
//   READ THE LOG: §BC-MODEL lines. Nothing is typed by hand: every table, field id, name, caption, type, length, NotBlank, TableRelation and option/enum value is read from the
//   .Table.al / .Enum.al files (W1 base application). Output: erp/plugins/bc_model.json (committed; the browser never fetches GitHub).
//   Output erp/plugins/bc_model.mjs (committed; the browser never fetches GitHub).
// Run:  node erp/tools/gen_bc_model.js <BCApps checkout>   (sparse is enough: src/Layers/W1/BaseApp)
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process');
var REPO = process.argv[2] || path.join(process.env.HOME, '.cache', 'bcapps', 'repo'), BASE = path.join(REPO, 'src', 'Layers', 'W1', 'BaseApp');
var OUT = path.join(__dirname, '..', 'plugins', 'bc_model.mjs');   // an ES module (export default …): the plugin imports it; node tools read it with readModel()
// the tables the converter reads (BC table id → why) — the mapping lives in plugins/bc_migrate_convert.mjs, this is only the extract list
var TABLES = { 3: 'Payment Terms', 9: 'Country/Region', 14: 'Location', 15: 'G/L Account', 18: 'Customer', 23: 'Vendor', 27: 'Item', 32: 'Item Ledger Entry',
  79: 'Company Information', 98: 'General Ledger Setup', 99: 'Item Vendor', 204: 'Unit of Measure', 222: 'Ship-to Address', 5722: 'Item Category', 7354: 'Bin' };
function log(s) { console.log(s); }
function walk(d, out) { fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) { var p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (/\.al$/.test(e.name)) out.push(p); }); return out; }
function unq(s) { s = String(s).trim(); return /^".*"$/.test(s) ? s.slice(1, -1) : s; }
function label(s) { var m = /'((?:[^']|'')*)'/.exec(s); return m ? m[1].replace(/''/g, "'") : null; }
// the body of a { } block starting at index i (the char after the opening brace), AL-aware enough for property blocks (strings and comments skipped)
function block(src, i) { var depth = 1, j = i, inS = false; while (j < src.length && depth) { var c = src[j];
    if (inS) { if (c === "'") inS = false; } else if (c === "'") inS = true; else if (c === '/' && src[j + 1] === '/') { j = src.indexOf('\n', j); if (j < 0) break; }
    else if (c === '{') depth++; else if (c === '}') depth--; j++; } return src.slice(i, j - 1); }
var sha = cp.execSync('git -C ' + JSON.stringify(REPO) + ' rev-parse HEAD').toString().trim();
var files = walk(BASE, []), enums = {}, tables = {};
// enums: enum <id> "Name" { value(<n>; "Name") { Caption = '…'; } … }
files.filter(function (f) { return /\.Enum\.al$/.test(f); }).forEach(function (f) {
  var src = fs.readFileSync(f, 'utf8'), m = /^enum\s+(\d+)\s+("[^"]+"|\S+)/m.exec(src); if (!m) return;
  var vals = [], re = /value\((\d+);\s*("[^"]*"|[^)]+)\)\s*\{([^}]*)\}/g, v;
  while ((v = re.exec(src))) vals.push({ ordinal: Number(v[1]), name: unq(v[2]), caption: label((/Caption\s*=\s*('(?:[^']|'')*')/.exec(v[3]) || [])[1] || '') });
  enums[unq(m[2])] = { id: Number(m[1]), file: path.relative(REPO, f), values: vals };
});
files.filter(function (f) { return /\.Table\.al$/.test(f); }).forEach(function (f) {
  var src = fs.readFileSync(f, 'utf8'), m = /^table\s+(\d+)\s+("[^"]+"|\S+)/m.exec(src); if (!m || !TABLES[m[1]]) return;
  var id = Number(m[1]), t = { id: id, name: unq(m[2]), file: path.relative(REPO, f), caption: null, fields: [] };
  var head = src.slice(src.indexOf('{', m.index) + 1, src.indexOf('fields', m.index)); t.caption = label((/Caption\s*=\s*('(?:[^']|'')*')/.exec(head) || [])[1] || '') || t.name;
  var re = /field\((\d+);\s*("[^"]+"|[^;]+);\s*([^)\r\n]+?)\)\s*\r?\n\s*\{/g, x;
  while ((x = re.exec(src))) {
    var body = block(src, re.lastIndex), type = x[3].trim(), tm = /^(\w+)(?:\[(\d+)\])?(?:\s+("[^"]+"|\S+))?$/.exec(type);
    var fd = { id: Number(x[1]), name: unq(x[2]), type: tm ? tm[1] : type, len: tm && tm[2] ? Number(tm[2]) : null,
      caption: label((/^\s*Caption\s*=\s*('(?:[^']|'')*')/m.exec(body) || [])[1] || '') || unq(x[2]) };
    if (/^\s*NotBlank\s*=\s*true/mi.test(body)) fd.notBlank = true;
    var cls = /^\s*FieldClass\s*=\s*(\w+)/m.exec(body); if (cls) fd.fieldClass = cls[1];
    var rel = /^\s*TableRelation\s*=\s*([^;]+);/m.exec(body); if (rel) fd.relation = rel[1].replace(/\s+/g, ' ').trim().slice(0, 200);
    var om = /^\s*OptionMembers\s*=\s*([^;]+);/m.exec(body); if (om) { fd.options = om[1].split(',').map(function (s) { return unq(s); });
      var oc = /^\s*OptionCaption\s*=\s*('(?:[^']|'')*')/m.exec(body); if (oc) fd.optionCaptions = label(oc[1]).split(','); }
    if (fd.type === 'Enum' && tm && tm[3]) { var en = enums[unq(tm[3])]; fd.enum = unq(tm[3]); if (en) fd.enumValues = en.values; else fd.enumMissing = true; }
    if (/^\s*ObsoleteState\s*=\s*Removed/m.test(body)) fd.obsolete = 'Removed'; else if (/^\s*ObsoleteState\s*=\s*Pending/m.test(body)) fd.obsolete = 'Pending';
    t.fields.push(fd);
  }
  tables[id] = t;
});
var missing = Object.keys(TABLES).filter(function (id) { return !tables[id]; }), enumMiss = [];
Object.keys(tables).forEach(function (id) { tables[id].fields.forEach(function (f) { if (f.enumMissing) enumMiss.push(id + '.' + f.name + ':' + f.enum); }); });
Object.keys(tables).sort(function (a, b) { return a - b; }).forEach(function (id) { var t = tables[id];
  log('§BC-MODEL table=' + id + ' "' + t.name + '" caption="' + t.caption + '" fields=' + t.fields.length + ' notBlank=' + t.fields.filter(function (f) { return f.notBlank; }).length +
    ' relations=' + t.fields.filter(function (f) { return f.relation; }).length + ' flow=' + t.fields.filter(function (f) { return f.fieldClass === 'FlowField'; }).length + ' file=' + t.file); });
log('§BC-MODEL source=microsoft/BCApps@' + sha + ' tables=' + Object.keys(tables).length + '/' + Object.keys(TABLES).length + ' missing=' + JSON.stringify(missing) + ' enumsUnresolved=' + enumMiss.length + (enumMiss.length ? ' ' + JSON.stringify(enumMiss.slice(0, 8)) : ''));
var out = { generator: 'erp/tools/gen_bc_model.js', source: 'https://github.com/microsoft/BCApps', commit: sha, license: 'MIT (Copyright (c) Microsoft Corporation) — table metadata extracted from it', layer: 'src/Layers/W1/BaseApp', tables: tables };
fs.writeFileSync(OUT, '// GENERATED by erp/tools/gen_bc_model.js from microsoft/BCApps@' + sha + ' (MIT) — do not edit; re-run the generator.\nexport default ' + JSON.stringify(out) + ';\n');
log('§BC-MODEL wrote ' + path.relative(path.join(__dirname, '..', '..'), OUT) + ' bytes=' + fs.statSync(OUT).size);
process.exit(missing.length ? 1 : 0);
