#!/usr/bin/env node
// read_tables.js <dir-or-dxf>... [--json out.json] : every ruled table of each sheet through dxf2tables.js (prompts/DXF2BIM_ARCHITECT_REVIEW.md §D111). Prints the §DXF_TABLES line per sheet + §DXF_TABLES_SWEEP.
'use strict';
const fs = require('fs'), path = require('path'), M = path.join(__dirname, '..'), DxfParser = require(path.join(M, 'lib/dxf-parser.js')), T = require(path.join(M, 'dxf2tables.js'));
const args = process.argv.slice(2), ji = args.indexOf('--json'), out = ji >= 0 ? args.splice(ji, 2)[1] : null, files = [];
(function walk(list) { list.forEach(function (p) { if (fs.statSync(p).isDirectory()) walk(fs.readdirSync(p).map(function (f) { return path.join(p, f); })); else if (/\.dxf$/i.test(p)) files.push(p); }); })(args);
const res = [], failed = []; let tables = 0, rows = 0, withT = 0;
files.sort().forEach(function (f) {
  let dxf; try { dxf = new DxfParser().parseSync(fs.readFileSync(f, 'utf8')); } catch (e) { failed.push(f); console.log('§DXF_TABLES_PARSE_FAIL ' + f + ' ' + e.message); return; }
  const r = T.read({ name: path.basename(f), dxf: dxf });
  if (r.tables.length) withT++; tables += r.tables.length; r.tables.forEach(function (t) { rows += t.rows.length; });
  res.push({ file: f, tables: r.tables, rejected: r.rejected });
});
console.log('§DXF_TABLES_SWEEP sheets=' + files.length + ' parsed=' + (files.length - failed.length) + ' with_tables=' + withT + ' tables=' + tables + ' rows=' + rows + (files.length ? '' : ' INCONCLUSIVE: no sheets'));
if (out) fs.writeFileSync(out, JSON.stringify(res));
