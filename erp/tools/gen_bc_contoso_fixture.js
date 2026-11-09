#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — gen_bc_contoso_fixture.js: the test package for "Migrate from Business Central", EXTRACTED from Microsoft's own demo company source
//   (github.com/microsoft/BCApps src/Apps/W1/ContosoCoffeeDemoDataset, MIT) — no live BC exists here. Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §BC-SPEC —
//   Witness: W-BC-MIGRATE. READ THE LOG: §BC-FIX lines.
//   How a value is found (nothing typed by hand): a demo codeunit calls a Contoso helper (ContosoCustomerVendor.InsertCustomer(…)); the helper's OWN body says which
//   field each parameter fills (Customer.Validate("No.", CustomerNo) / Customer."No." := CustomerNo; an overload that calls the full one is followed); each argument is
//   resolved from a quoted literal, a Label of that file, or a procedure's exit(…) of the codeunit the variable names. What cannot be resolved without running BC
//   (setup values, AdjustDate, …) is left EMPTY and counted (§BC-FIX unresolved), never filled.
//   Output: erp/tests/fixtures/bc_package_contoso/rows.json (rows per BC table, each with its source file:line) — the witness writes it out in BC's own Excel layout.
// Run:  node erp/tools/gen_bc_contoso_fixture.js <BCApps checkout>
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process');
var REPO = process.argv[2] || path.join(process.env.HOME, '.cache', 'bcapps', 'repo'), DS = path.join(REPO, 'src', 'Apps', 'W1', 'ContosoCoffeeDemoDataset', 'app');
var MODEL = (function () { var t = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'bc_model.mjs'), 'utf8'); return JSON.parse(t.slice(t.indexOf('export default ') + 15).replace(/;\s*$/, '')); })(), OUTD = path.join(__dirname, '..', 'tests', 'fixtures', 'bc_package_contoso');
function walk(d, out) { fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) { var p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (/\.al$/.test(e.name)) out.push(p); }); return out; }
function unq(s) { s = String(s).trim(); return /^".*"$/.test(s) ? s.slice(1, -1) : s; }
// split a call's argument text at top-level commas (quotes and brackets respected)
function splitArgs(s) { var out = [], d = 0, q = false, cur = ''; for (var i = 0; i < s.length; i++) { var c = s[i];
    if (q) { cur += c; if (c === "'") { if (s[i + 1] === "'") { cur += s[++i]; } else q = false; } continue; }
    if (c === "'") { q = true; cur += c; continue; } if (c === '"') { var j = s.indexOf('"', i + 1); cur += s.slice(i, j + 1); i = j; continue; }
    if (c === '(' || c === '[') d++; if (c === ')' || c === ']') d--; if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; continue; } cur += c; }
  if (cur.trim() !== '') out.push(cur.trim()); return out; }
// the text inside the parentheses that open at index i (s[i] === '(')
function parens(s, i) { var d = 0, q = false; for (var j = i; j < s.length; j++) { var c = s[j]; if (q) { if (c === "'") q = false; continue; } if (c === "'") { q = true; continue; }
    if (c === '"') { j = s.indexOf('"', j + 1); continue; } if (c === '(') d++; else if (c === ')') { d--; if (!d) return { text: s.slice(i + 1, j), end: j }; } } return null; }
var files = walk(DS, []), CU = {}, FILE = {};
files.forEach(function (f) {
  var src = fs.readFileSync(f, 'utf8'), m = /^codeunit\s+\d+\s+("[^"]+"|\S+)/m.exec(src); if (!m) return;
  var cu = { name: unq(m[1]), file: f, src: src, labels: {}, procs: {}, vars: {} };
  var lr = /(\w+)\s*:\s*Label\s+'((?:[^']|'')*)'/gi, x; while ((x = lr.exec(src))) cu.labels[x[1]] = x[2].replace(/''/g, "'");
  var vr = /(\w+)\s*:\s*Codeunit\s+("[^"]+"|\w+)\s*;/gi; while ((x = vr.exec(src))) cu.vars[x[1]] = unq(x[2]);
  var rr = /(\w+)\s*:\s*Record\s+("[^"]+"|\w+)/gi; cu.recs = {}; while ((x = rr.exec(src))) cu.recs[x[1]] = unq(x[2]);
  cu.assign = {}; var ar = /^\s+(\w+)\s*:=\s*([^;]+);/gm; while ((x = ar.exec(src))) (cu.assign[x[1]] = cu.assign[x[1]] || []).push(x[2].trim());
  var pr = /procedure\s+(\w+)\s*\(([^)]*)\)[^\n]*\n([\s\S]*?)\n    end;/gi;
  while ((x = pr.exec(src))) { (cu.procs[x[1]] = cu.procs[x[1]] || []).push({ params: x[2].trim() ? x[2].split(';').map(function (p) { return p.trim().replace(/^var\s+/, '').split(':')[0].trim(); }) : [], body: x[3], line: src.slice(0, x.index).split('\n').length }); }
  CU[cu.name] = cu; FILE[f] = cu;
});
var unresolved = {}, ACCT = {}, INITV = {};
// FIXTURE PARAMETER: the day the demo company is installed. Contoso dates are relative to it (ContosoCoffeeDemoDataSetup.InitRecord: Starting Year = Today's year - 1).
var TODAY = process.env.BC_FIXTURE_TODAY || '2026-11-09', STARTING_YEAR = Number(TODAY.slice(0, 4)) - 1;
function isoWeek(d) { var t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), dn = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dn);
  var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 86400000 + 1) / 7); }
function dwy2date(wd, wk, yr) { var j4 = new Date(Date.UTC(yr, 0, 4)), dn = j4.getUTCDay() || 7, mon = new Date(j4); mon.setUTCDate(j4.getUTCDate() - dn + 1); mon.setUTCDate(mon.getUTCDate() + (wk - 1) * 7 + (wd - 1)); return mon; }
function iso(d) { return d.toISOString().slice(0, 10); }
// ContosoUtilities.AdjustDate (ContosoUtilities.Codeunit.al:29-64), ported: +92 years, then the same day of the month for a first/last day, else the same ISO week day
function adjustDate(yyyymmdd) { var y = Number(yyyymmdd.slice(0, 4)) + 92, m = Number(yyyymmdd.slice(4, 6)), d = Number(yyyymmdd.slice(6, 8)), t = new Date(Date.UTC(y, m - 1, d));
  var wd = t.getUTCDay() || 7, wk = isoWeek(t), year = y + STARTING_YEAR - 1994, last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d === 1 || d === last && m !== 2 || (m === 2 && d === 28)) return iso(new Date(Date.UTC(year, m - 1, d)));
  return iso(dwy2date(wd, wk, year)); }
// InitValue of every field of every table in the dataset (the setup tables)
files.forEach(function (f) { var src = fs.readFileSync(f, 'utf8'), m = /^table\s+\d+\s+("[^"]+"|\S+)/m.exec(src); if (!m) return;
  var re = /field\(\d+;\s*("[^"]+"|[^;]+);[^)]*\)\s*\{([^}]*)\}/g, x; while ((x = re.exec(src))) { var iv = /InitValue\s*=\s*'?([^';]*)'?\s*;/.exec(x[2]); if (iv) INITV[unq(m[1]) + '.' + unq(x[1])] = iv[1]; } });
function resolve(expr, cu, depth) {
  expr = String(expr).trim(); if (depth > 6) return undefined;
  var m;
  if ((m = /^'((?:[^']|'')*)'$/.exec(expr))) return m[1].replace(/''/g, "'");
  if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
  if (/^(true|false)$/i.test(expr)) return expr.toLowerCase() === 'true';
  if ((m = /^\w+\.AdjustDate\((\d{8})D\)$/.exec(expr)) && cu.vars[expr.split('.')[0]] === 'Contoso Utilities') return adjustDate(m[1]);
  if ((m = /^Enum::("[^"]+"|\w+)::("[^"]+"|\w+)$/.exec(expr)) || (m = /^("[^"]+"|\w+)::("[^"]+"|\w+)$/.exec(expr))) return { enumValue: unq(m[2]) };
  if (cu.labels[expr] !== undefined) return cu.labels[expr];
  if ((m = /^(\w+)\.(\w+)\(\)$/.exec(expr)) && cu.vars[m[1]] && CU[cu.vars[m[1]]]) return procValue(CU[cu.vars[m[1]]], m[2], depth);
  // Contoso's own account-number lookup: GetAccountNo(<name>) = the number AddAccountForLocalization(<name>, '<no>') stored last (ContosoGLAccount.Codeunit.al:27-44)
  if ((m = /^(\w+)\.GetAccountNo\((.+)\)$/.exec(expr)) && cu.vars[m[1]] === 'Contoso GL Account') { var nm = resolve(m[2], cu, depth + 1); return nm !== undefined && ACCT[nm] !== undefined ? ACCT[nm] : undefined; }
  // a setup record's field the demo has not set = the field's InitValue in the setup table (ContosoCoffeeDemoDataSetup."Country/Region Code" InitValue 'GB')
  if ((m = /^(\w+)\."([^"]+)"$/.exec(expr)) && cu.recs[m[1]] && INITV[cu.recs[m[1]] + '.' + m[2]] !== undefined) return INITV[cu.recs[m[1]] + '.' + m[2]];
  // a variable assigned ONCE in this codeunit (DefaultUOMCode := CommonUOM.Piece();)
  if (/^\w+$/.test(expr) && cu.assign[expr] && cu.assign[expr].length === 1) return resolve(cu.assign[expr][0], cu, depth + 1);
  if ((m = /^(\w+)\(\)$/.exec(expr))) return procValue(cu, m[1], depth);
  unresolved[expr.slice(0, 60)] = (unresolved[expr.slice(0, 60)] || 0) + 1; return undefined;
}
function procValue(cu, name, depth) { var p = (cu.procs[name] || []).filter(function (q) { return !q.params.length; })[0]; if (!p) return undefined;
  var m = /exit\(([\s\S]*?)\);/.exec(p.body); return m ? resolve(m[1], cu, depth + 1) : undefined; }
function add(map, pi, fld) { var a = map.fields[pi] = map.fields[pi] || []; if (a.indexOf(fld) < 0) a.push(fld); }   // one parameter can fill several fields (Base / Sales / Purch. Unit of Measure)
// a helper's field map for an overload with n args: param index → BC field name, following an overload that delegates to another
function fieldMap(helper, proc, n, depth) {
  var ov = (helper.procs[proc] || []).filter(function (p) { return p.params.length === n; })[0]; if (!ov || depth > 4) return null;
  var map = { table: null, fields: {}, consts: {} }, x;
  var re = /(\w+)\.Validate\(\s*("[^"]+"|\w+)\s*,\s*([^;]+?)\)\s*;/g, re2 = /(\w+)\.("[^"]+"|\w+)\s*:=\s*([^;]+?);/g;
  var lcp = ov.params.map(function (q) { return q.toLowerCase(); });
  [re, re2].forEach(function (r) { while ((x = r.exec(ov.body))) { var rec = x[1], fld = unq(x[2]), val = x[3].trim(), pi = lcp.indexOf(val.toLowerCase());
      if (!helper.recs[rec]) continue; map.table = map.table || helper.recs[rec]; if (helper.recs[rec] !== map.table) continue;
      if (pi >= 0) add(map, pi, fld); } });
  // case <Param> of <Param>::"V": <Rec>.Validate("<Field>", <Rec>."<Field>"::"V") — the parameter's enum value lands in that field (GLAccount "Income/Balance")
  var cr = /case\s+(\w+)\s+of([\s\S]*?)\bend;/gi;
  while ((x = cr.exec(ov.body))) { var cpi = lcp.indexOf(x[1].toLowerCase()), cv = /(\w+)\.Validate\(\s*("[^"]+"|\w+)\s*,\s*\1\.\2::/i.exec(x[2]);
    if (cpi >= 0 && cv && helper.recs[cv[1]]) { map.table = map.table || helper.recs[cv[1]]; add(map, cpi, unq(cv[2])); } }
  // a local helper that receives the record: ValidateAccountCategory(GLAccount, AccountCategory, …) → its own Validate on its record parameter
  Object.keys(helper.procs).forEach(function (pn) { if (pn === proc) return; var cre = new RegExp('(^|[^.\\w])' + pn + '\\s*\\(', 'gi'), c;
    while ((c = cre.exec(ov.body))) { var inner2 = parens(ov.body, c.index + c[0].length - 1); if (!inner2) continue; var a2 = splitArgs(inner2.text), callee = (helper.procs[pn] || []).filter(function (q) { return q.params.length === a2.length; })[0];
      if (!callee || !a2.length || !helper.recs[a2[0]]) continue; var recP = callee.params[0], lc2 = callee.params.map(function (q) { return q.toLowerCase(); }), y, r3 = /(\w+)\.Validate\(\s*("[^"]+"|\w+)\s*,\s*(\w+)\s*\)/gi;
      while ((y = r3.exec(callee.body))) { if (y[1].toLowerCase() !== recP.toLowerCase()) continue; var ci = lc2.indexOf(y[3].toLowerCase()); if (ci < 0) continue; var opi = lcp.indexOf(String(a2[ci]).trim().toLowerCase());
        if (opi >= 0) { map.table = map.table || helper.recs[a2[0]]; add(map, opi, unq(y[2])); } } } });
  if (!Object.keys(map.fields).length) {   // an overload that only calls the full one: follow it
    // the overload hands over to a sibling procedure of the same helper (InsertInventoryItem → InsertItem(…, Enum::"Item Type"::Inventory, …))
    var call = null, callee = proc;
    Object.keys(helper.procs).some(function (pn) { var c = new RegExp('(^|[^.\\w])' + pn + '\\s*\\(').exec(ov.body); if (c) { call = { index: c.index + c[1].length, len: c[0].length - c[1].length }; callee = pn; return true; } return false; });
    if (!call) return null;
    var inner = parens(ov.body, call.index + call.len - 1), args = splitArgs(inner.text), full = fieldMap(helper, callee, args.length, depth + 1); if (!full) return null;
    map.table = full.table; Object.keys(full.consts).forEach(function (k) { map.consts[k] = full.consts[k]; });
    args.forEach(function (a, ai) { var pi = lcp.indexOf(a.trim().toLowerCase()); if (!full.fields[ai]) return; full.fields[ai].forEach(function (fld) { if (pi >= 0) add(map, pi, fld); else map.consts[fld] = { expr: a.trim(), cu: helper }; }); });
  }
  return map;
}
Object.keys(CU).forEach(function (n) { var cu = CU[n], re = /(\w+)\.AddAccountForLocalization\(([^;]+)\);/g, x;
  while ((x = re.exec(cu.src))) { if (cu.vars[x[1]] !== 'Contoso GL Account') continue; var a = splitArgs(x[2]); var nm = resolve(a[0], cu, 0), no = resolve(a[1], cu, 0);
    if (nm !== undefined && no !== undefined) ACCT[nm] = no; } });
console.log('§BC-FIX account-numbers=' + Object.keys(ACCT).length + ' (AddAccountForLocalization, last write wins)');
// the calls that create the rows the converter reads: helper codeunit + procedure → BC table (checked against the helper's own record type)
var CALLS = [['Contoso Item', 'InsertItemJournalLine'], ['Contoso Company', 'InsertCompanyInformation'], ['Create General Ledger Setup', 'InsertData'], ['Contoso Customer/Vendor', 'InsertCustomer'], ['Contoso Customer/Vendor', 'InsertVendor'], ['Contoso Customer/Vendor', 'InsertShiptoAddress'],
  ['Contoso Item', 'InsertItem'], ['Contoso Item', 'InsertInventoryItem'], ['Contoso Item', 'InsertServiceItem'], ['Contoso Item', 'InsertNonInventoryItem'], ['Contoso Item', 'InsertItemCategory'],
  ['Contoso Unit of Measure', 'InsertUnitOfMeasure'], ['Contoso Payments', 'InsertPaymentTerms'], ['Contoso Warehouse', 'InsertLocation'], ['Contoso Inventory', 'InsertLocation'],
  ['Contoso Warehouse', 'InsertBin'], ['Contoso GL Account', 'InsertGLAccount'], ['Contoso Country Or Region', 'InsertCountryOrRegion']];
var byName = {}; Object.keys(MODEL.tables).forEach(function (id) { byName[MODEL.tables[id].name] = Number(id); });
var rows = {}, used = {}, nCalls = 0, skipped = {};
CALLS.forEach(function (c) { if (!CU[c[0]]) { console.log('§BC-FIX helper-missing ' + c[0]); return; } });
files.filter(function (f) { return f.indexOf(path.sep + 'DemoData' + path.sep) >= 0; }).forEach(function (f) {
  var cu = FILE[f]; if (!cu) return;
  // a call through a variable of the helper's type (ContosoItem.InsertItem(…)), or a bare call inside the helper itself (Create General Ledger Setup: InsertData(…) in OnRun)
  Object.keys(cu.vars).map(function (v) { return [v, CU[cu.vars[v]]]; }).concat([[null, cu]]).forEach(function (vh) { var v = vh[0], helper = vh[1]; if (!helper) return;
    CALLS.filter(function (c) { return c[0] === helper.name; }).forEach(function (c) {
      var re = v ? new RegExp('\\b' + v + '\\.' + c[1] + '\\s*\\(', 'g') : new RegExp('(?:^|[^.\\w])(?<!procedure\\s)' + c[1] + '\\s*\\(', 'g'), x;
      while ((x = re.exec(cu.src))) {
        var pa = parens(cu.src, x.index + x[0].length - 1); if (!pa) continue; var args = splitArgs(pa.text), map = fieldMap(helper, c[1], args.length, 0);
        if (map && map.table === 'Item Journal Line') map.table = 'Item Ledger Entry';   // FIXTURE: the demo's item journal lines, as BC's Item Jnl.-Post Line writes them (same field names)
        if (!map || !byName[map.table]) { skipped[c[1] + '/' + args.length] = (skipped[c[1] + '/' + args.length] || 0) + 1; continue; }
        var t = byName[map.table], row = {}, any = false; nCalls++;
        Object.keys(map.consts).forEach(function (fld) { var v3 = resolve(map.consts[fld].expr, map.consts[fld].cu, 0); if (v3 !== undefined) row[fld] = v3; });
        Object.keys(map.fields).forEach(function (pi) { var v2 = resolve(args[pi], cu, 0); if (v2 !== undefined) { map.fields[pi].forEach(function (fld) { row[fld] = v2; }); any = true; } });
        row._src = path.relative(REPO, f) + ':' + cu.src.slice(0, x.index).split('\n').length;
        (rows[t] = rows[t] || []).push(row);
      }
    }); });
});
if (rows[32]) rows[32] = rows[32].filter(function (r) { return r['Item No.'] !== undefined && r['Item No.'] !== ''; });   // a journal line whose item is a setup value is not resolvable
Object.keys(rows).forEach(function (t) { var key = { 18: 'No.', 23: 'No.', 27: 'No.', 5722: 'Code', 204: 'Code', 3: 'Code', 14: 'Code', 15: 'No.', 9: 'Code' }[t];
  // FIXTURE RULE (not a claim about BC's run order): Microsoft's demo defines some records twice (Common module: bare; Sales module: the full card, CreateCustomer.Codeunit.al);
  //   they are merged — a later non-empty value fills or replaces an earlier one, both sources kept in _src.
  if (!key) return; var by = {}, order = []; rows[t].forEach(function (r) { var k = r[key]; if (k === undefined || k === '') return;
    if (!by[k]) { by[k] = r; order.push(k); return; } var b = by[k]; Object.keys(r).forEach(function (f) { if (f === '_src') b._src += ' + ' + r._src; else if (r[f] !== '' && r[f] !== undefined) b[f] = r[f]; }); });
  rows[t] = order.map(function (k) { return by[k]; }); });
var sha = cp.execSync('git -C ' + JSON.stringify(REPO) + ' rev-parse HEAD').toString().trim();
Object.keys(rows).sort(function (a, b) { return a - b; }).forEach(function (t) { var fs2 = {}; rows[t].forEach(function (r) { Object.keys(r).forEach(function (k) { if (k !== '_src') fs2[k] = 1; }); });
  console.log('§BC-FIX table=' + t + ' "' + MODEL.tables[t].name + '" rows=' + rows[t].length + ' fields=' + JSON.stringify(Object.keys(fs2))); });
var un = Object.keys(unresolved).sort(function (a, b) { return unresolved[b] - unresolved[a]; });
console.log('§BC-FIX calls=' + nCalls + ' skipped=' + JSON.stringify(skipped) + ' unresolved-args=' + un.length + ' top=' + JSON.stringify(un.slice(0, 10).map(function (k) { return k + '×' + unresolved[k]; })));
fs.mkdirSync(OUTD, { recursive: true });
fs.writeFileSync(path.join(OUTD, 'rows.json'), JSON.stringify({ generator: 'erp/tools/gen_bc_contoso_fixture.js', source: 'https://github.com/microsoft/BCApps', commit: sha,
  dataset: 'src/Apps/W1/ContosoCoffeeDemoDataset (MIT, Copyright (c) Microsoft Corporation)', today: TODAY, startingYear: STARTING_YEAR,
  note: 'values Microsoft\'s demo company writes; setup-dependent values left empty; demo dates by AdjustDate with the demo installed on ' + TODAY + '; Item Ledger Entry = the demo item journal lines as posted; a record defined twice is merged (later non-empty wins)', rows: rows }, null, 0));
console.log('§BC-FIX wrote erp/tests/fixtures/bc_package_contoso/rows.json');
