// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — ninja_csv.js: a table's PROPERTIES CSV becomes the Ninja model (bim-compiler prompts/ERP_MIS_WINDOW_FROM_CSV.md §3.2, §9). READ THE LOG of W-MIS-CSV-MODEL after every change.
// Pure (UMD, no database, no file access): the door and the browser's Create face share it. NO second grammar: each row becomes the Ninja column token, ONE 2_RO_ModelMaker row is built and
// NinjaModel.parseSheet reads it, so the model is what a workbook with that row gives. What the Ninja grammar has no token for (Length, Mandatory, Identifier, Default, Help, list names, Lookup)
// rides as additive keys on the column. A typed CSV fails loudly: every fault is a refusal naming the row and the heading, and with any refusal there is NO model.
//   fromGrid(grid, opts) / fromText(text, XLSX, opts)   opts { table, master, workflow, name, existing(tableName) -> EntityType|null, brk (witness falsifier: droplist | lenient | coerce) }
//   -> { ok, table, model, refusals:[{row, column, cell, why}], carried:[headings that reached the model] }      row = the sheet line (1 = the header); row 0 = the line's own inputs
(function (global) {
  'use strict';
  var NM = (typeof module !== 'undefined' && module.exports && typeof require === 'function') ? require('./ninja_model.js') : global.NinjaModel;
  var HEADS = ['Column', 'Type', 'Length', 'Mandatory', 'Identifier', 'Default', 'List', 'Lookup', 'Callout', 'Help'];
  // the Ninja words and their prefix (ninja_model.js PREFIX_MAP, from NinjaProcessor.java addColumnFromDef); a one-letter prefix is taken as written (D = Date, d = DateTime)
  var WORDS = { string: 'S', quantity: 'Q', amount: 'A', yesno: 'Y', date: 'D', datetime: 'd', text: 'T', list: 'L' };
  var PFX = { S: 1, Q: 1, A: 1, Y: 1, D: 1, d: 1, T: 1, L: 1 };
  var NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
  var WF = ['DocStatus', 'DocAction', 'Processed', 'DocumentNo', 'IsApproved'];
  function typeName(refId) { var DT = NM.DT, k; for (k in DT) if (DT[k] === refId) return k; return 'reference ' + refId; }

  function fromGrid(grid, opts) {
    opts = opts || {}; var R = [], brk = opts.brk || '';
    var no = function (row, column, cell, why) { R.push({ row: row, column: column, cell: cell == null ? '' : String(cell), why: why }); };
    var table = String(opts.table || '').trim(), master = String(opts.master || '').trim(), workflow = String(opts.workflow || '').toUpperCase() === 'Y';
    // 8. the table name
    if (!NAME.test(table)) no(0, 'table', table, 'the table name must be letters, digits and _ (starting with a letter)');
    else if (typeof opts.existing === 'function') { var et = opts.existing(table); if (et != null && et !== 'U') no(0, 'table', table, 'a table of this name already exists in the dictionary (entity type "' + et + '") and is not a user-made one; Ninja does not recreate it (MRO_ModelMaker.java L107-116)'); }
    if (master && !NAME.test(master)) no(0, 'master', master, 'the master table name must be letters, digits and _');
    // 1. the headings
    var head = (grid && grid[0] ? grid[0] : []).map(function (h) { return String(h == null ? '' : h).trim(); }), at = {};
    head.forEach(function (h, i) {
      if (!h) return;
      var k = HEADS.filter(function (x) { return x.toLowerCase() === h.toLowerCase(); })[0];
      if (!k) return no(1, h, h, 'unknown heading; the headings are: ' + HEADS.join(', '));
      if (k in at) return no(1, k, h, 'heading given twice');
      at[k] = i;
    });
    if (!('Column' in at)) no(1, 'Column', '', 'the sheet has no Column heading (the only one that is required)');
    var std = NM.standardColumns(table).map(function (c) { return c.name.toLowerCase(); }), seen = {}, cols = [];
    for (var r = 1; r < (grid || []).length && 'Column' in at; r++) {
      var line = grid[r] || [], cell = function (h) { return h in at ? String(line[at[h]] == null ? '' : line[at[h]]).trim() : ''; }, n = r + 1;
      if (!line.some(function (c) { return String(c == null ? '' : c).trim() !== ''; })) continue;   // an empty line
      var name = cell('Column');
      // 2. the column name
      if (!name) { no(n, 'Column', '', 'a row with values needs a column name'); continue; }
      if (!NAME.test(name)) { no(n, 'Column', name, 'a column name is letters, digits and _ (starting with a letter)'); continue; }
      // 3. twice, or a column Ninja adds itself
      var lc = name.toLowerCase();
      if (seen[lc]) { no(n, 'Column', name, 'column given twice (also on line ' + seen[lc] + ')'); continue; }
      seen[lc] = n;
      if (std.indexOf(lc) >= 0) { no(n, 'Column', name, 'a standard column: Ninja adds it to every table, it must not be listed'); continue; }
      if (workflow && WF.some(function (w) { return w.toLowerCase() === lc; })) { no(n, 'Column', name, 'a workflow column: workflow=Y adds it, it must not be listed'); continue; }
      // 4. the type word
      var tw = cell('Type'), pfx = '', bad = false;
      if (tw) { pfx = PFX[tw] && tw.length === 1 ? tw : WORDS[tw.toLowerCase()]; if (!pfx) { no(n, 'Type', tw, 'unknown type; the types are: String, Quantity, Amount, YesNo, Date, DateTime, Text, List (or S Q A Y D d T L)'); bad = true; pfx = ''; } }
      // 6. the list
      var lt = cell('List'), values = [], names = [];
      if (lt) {
        if (pfx && pfx !== 'L') { no(n, 'List', lt, 'list values on a column whose Type is not List'); bad = true; }
        pfx = 'L';
        lt.split(',').forEach(function (item) {
          var e = item.indexOf('='), v = (e < 0 ? item : item.slice(0, e)).trim(), nm = e < 0 ? v : item.slice(e + 1).trim();
          if (!v || /[\s\/=]/.test(v) || /[\/=]/.test(nm) || !nm) { no(n, 'List', item, 'a list entry is VALUE or VALUE=Name; the value holds no space, / or =, the name no / or ='); bad = true; return; }
          if (values.indexOf(v) >= 0) { no(n, 'List', item, 'list value given twice'); bad = true; return; }
          values.push(v); names.push(nm);
        });
      } else if (pfx === 'L') { no(n, 'List', '', 'a List column needs its values (VALUE=Name, separated by commas)'); bad = true; }
      // 7. the plain properties
      var len = cell('Length'), man = cell('Mandatory').toUpperCase(), idn = cell('Identifier').toUpperCase(), look = cell('Lookup'), call = cell('Callout');
      if (len && !/^[1-9]\d*$/.test(len)) { no(n, 'Length', len, 'a length is a whole number above 0'); bad = true; }
      if (man && man !== 'Y' && man !== 'N') { no(n, 'Mandatory', cell('Mandatory'), 'Y, N or empty'); bad = true; }
      if (idn && idn !== 'Y' && idn !== 'N') { no(n, 'Identifier', cell('Identifier'), 'Y, N or empty'); bad = true; }
      if (look && !/_ID$/.test(name)) { no(n, 'Lookup', look, 'a lookup column\'s name ends in _ID'); bad = true; }
      if (look && !NAME.test(look)) { no(n, 'Lookup', look, 'the lookup is a table name (letters, digits and _)'); bad = true; }
      if (call && !/^[A-Za-z_][\w.]*\.[A-Za-z_]\w*$/.test(call)) { no(n, 'Callout', call, 'a callout is class.method'); bad = true; }
      if (bad) continue;
      // the Ninja token, and 5: the type the grammar gives it must be the type asked for
      var token = (pfx ? pfx + '#' : '') + name + (values.length && brk !== 'droplist' ? '=' + values.join('/') : '') + (call ? '@' + call : '');
      if (tw || lt) { var want = NM.parseColDef(pfx + '#' + name, []), got = NM.parseColDef(pfx + '#X', []);   // got = what the prefix alone means; want = what Ninja makes of prefix + this name
        if (want && got && want.refId !== got.refId) { no(n, 'Type', tw || 'List', 'Ninja reads the NAME first: a column called ' + name + ' becomes ' + typeName(want.refId) + ' whatever the prefix (NinjaProcessor.addColumnFromDef), not ' + typeName(got.refId) + '; rename the column or state ' + typeName(want.refId)); continue; } }
      cols.push({ name: name, token: token, line: n, length: len, mandatory: man === 'Y', identifier: idn === 'Y', def: cell('Default'), help: cell('Help'), lookup: look, names: names, values: values });
    }
    if ('Column' in at && !cols.length && !R.length) no(1, 'Column', '', 'the sheet lists no column');
    if (R.length && brk !== 'lenient') return { ok: false, table: table, model: null, refusals: R, carried: [] };
    // ONE 2_RO_ModelMaker row -> the workbook parser (ninja_model.js parseRomo)
    var us = table.indexOf('_'), bundle = us > 0 ? table.slice(0, us) : table;
    var sheet = [['RO_ModelHeader_ID', 'SeqNo', 'WorkflowStructure', 'KanbanBoard', 'Master', 'Name', 'Help', 'ColumnSet'], [bundle, '10', workflow ? 'Y' : 'N', 'N', master, table, '', cols.map(function (c) { return c.token; }).join(',')]];
    var model = NM.parseSheet(sheet, { bundleName: bundle }), t = model.tables[0], carried = { Column: 1 };
    if (opts.name) t.label = String(opts.name);
    cols.forEach(function (c) {
      var m = t.columns.filter(function (x) { return x.name === c.name; })[0]; if (!m) return;
      if (c.length) { m.length = Number(c.length); carried.Length = 1; }
      if (c.mandatory) { m.mandatory = true; carried.Mandatory = 1; }
      if (c.identifier) { m.identifier = true; carried.Identifier = 1; }
      if (c.def !== '') { m.defaultValue = c.def; carried.Default = 1; }
      if (c.help) { m.help = c.help; carried.Help = 1; }
      if (c.names.length && m.listValues) { m.listNames = c.names; carried.List = 1; }
      if (c.lookup) { m.fkTable = c.lookup; carried.Lookup = 1; }
      if (m.callout) carried.Callout = 1;
      if (c.token.indexOf('#') > 0) carried.Type = 1;
    });
    return { ok: R.length === 0, table: table, model: model, refusals: R, carried: HEADS.filter(function (h) { return carried[h]; }) };
  }
  // the host's SheetJS, ALWAYS raw (007 stays 007, 1e5 stays 1e5, a date stays its text)
  function fromText(text, XLSX, opts) {
    var raw = !(opts && opts.brk === 'coerce'), wb = XLSX.read(String(text), { type: 'string', raw: raw });
    var grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: raw, defval: '' }).map(function (r) { return r.map(function (c) { return String(c); }); });
    return fromGrid(grid, opts);
  }
  var API = { fromGrid: fromGrid, fromText: fromText, HEADS: HEADS, WORDS: WORDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else global.NinjaCsv = API;
})(typeof self !== 'undefined' ? self : this);
