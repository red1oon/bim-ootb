// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// manifest_to_xlsx.js — bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §BIMDOC-LEGACY, NEURO_SYMBOLIC_ORDER_CONTRACT.md §R.V item 12.
// A plugin bundle's staged `dictionary` rows (twin form: integer ids) -> the ERP data-model WORKBOOK: one sheet per AD table, one row per record,
// header = the AD column names, a `Key` column that names the row. A value that points at another row of the workbook is `ref:<Key>`; one that points
// at a row the server already has (a core table, window, tab) is `existing:<AD_Table>:<UU>`. Ids, UU, client/org/active/audit columns are NOT in the sheet
// (the pack gives them). Sheet `Plugin` carries id, version, description. Run: node erp/tools/manifest_to_xlsx.js <bundle.mjs> <out.xlsx>
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.join(__dirname, '..', '..');
const XLSX = require(path.join(REPO, 'erp', 'xlsx.mini.min.js'));
const SKIP = new Set(['ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby', 'updated', 'updatedby']);
// foreign-key columns whose name is not simply <table>_id
const FK_TABLE = { node_id: 'ad_menu', parent_id: 'ad_menu', ad_key: 'ad_column', ad_display: 'ad_column', ad_reference_value_id: 'ad_reference', ad_val_rule_id: 'ad_val_rule', parent_column_id: 'ad_column', ad_column_id: 'ad_column' };
// the order a pack must declare rows in: a row only refs an EARLIER one
const ORDER = ['ad_element', 'ad_reference', 'ad_ref_list', 'ad_process', 'ad_window', 'ad_table', 'ad_column', 'ad_ref_table', 'ad_tab', 'ad_field', 'ad_menu', 'ad_treenodemm'];
const SHEET = { ad_element: 'AD_Element', ad_reference: 'AD_Reference', ad_ref_list: 'AD_Ref_List', ad_process: 'AD_Process', ad_window: 'AD_Window', ad_table: 'AD_Table', ad_column: 'AD_Column', ad_ref_table: 'AD_Ref_Table', ad_tab: 'AD_Tab', ad_field: 'AD_Field', ad_menu: 'AD_Menu', ad_treenodemm: 'AD_TreeNodeMM' };
const DROP_TABLES = new Set();   // (the menu's place in the tree is its own sheet: a pack carries it as Parent_ID + SeqNo inside the AD_Menu element)

function keyOf(table, row) {
  const g = (k) => row[k];
  switch (table) {
    case 'ad_element': return g('columnname');
    case 'ad_reference': return g('name');
    case 'ad_ref_list': return g('ad_reference_id') + '|' + g('value');
    case 'ad_process': return g('value');
    case 'ad_window': return g('name');
    case 'ad_table': return g('tablename');
    case 'ad_column': return g('ad_table_id') + '.' + g('columnname');
    case 'ad_ref_table': return g('ad_reference_id');
    case 'ad_tab': return g('ad_window_id') + '/' + g('name') + '#' + g('seqno');
    case 'ad_field': return g('ad_tab_id') + '.' + g('ad_column_id');
    case 'ad_menu': return g('name');
    case 'ad_treenodemm': return String(g('node_id') || '').replace(/^ref:/, '');
    default: return null;
  }
}
async function main(bundle, out) {
  const { manifest } = await import(path.resolve(bundle));
  const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'tests', 'node_modules', 'sql.js'));
  const SQL = await initSqlJs(), seed = new SQL.Database(fs.readFileSync(path.join(REPO, 'erp', 'ad_seed.db')));
  const sq = (s, p) => { const st = seed.prepare(s); try { st.bind(p || []); return st.step() ? st.getAsObject() : null; } finally { st.free(); } };
  const tables = {}; manifest.dictionary.filter((d) => !DROP_TABLES.has(d.table)).forEach((d) => { tables[d.table] = d; });
  // pass 1: the key of every staged row, by (table,id), built in dependency order so a key may use the keys of the rows it points at
  const idKey = {};   // table -> id -> key
  const keys = {};
  // a row of the dictionary seed, named the way a person names it; refused when that name is not unique (then the UU is used)
  const NAMED = {
    ad_table: { sql: 'SELECT tablename AS n FROM ad_table WHERE ad_table_id=?', by: 'SELECT ad_table_id AS i FROM ad_table WHERE tablename=?' },
    ad_window: { sql: 'SELECT name AS n FROM ad_window WHERE ad_window_id=?', by: 'SELECT ad_window_id AS i FROM ad_window WHERE name=?' },
    ad_reference: { sql: 'SELECT name AS n FROM ad_reference WHERE ad_reference_id=?', by: 'SELECT ad_reference_id AS i FROM ad_reference WHERE name=?' },
    ad_menu: { sql: 'SELECT name AS n FROM ad_menu WHERE ad_menu_id=?', by: 'SELECT ad_menu_id AS i FROM ad_menu WHERE name=?' },
    ad_tab: { sql: 'SELECT w.name || \'/\' || t.name AS n FROM ad_tab t JOIN ad_window w ON w.ad_window_id=t.ad_window_id WHERE t.ad_tab_id=?',
      by: 'SELECT t.ad_tab_id AS i FROM ad_tab t JOIN ad_window w ON w.ad_window_id=t.ad_window_id WHERE w.name || \'/\' || t.name=?' },
    ad_column: { sql: 'SELECT t.tablename || \'.\' || c.columnname AS n FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE c.ad_column_id=?',
      by: 'SELECT c.ad_column_id AS i FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE t.tablename || \'.\' || c.columnname=?' }
  };
  const CASE = { ad_table: 'AD_Table', ad_window: 'AD_Window', ad_reference: 'AD_Reference', ad_menu: 'AD_Menu', ad_tab: 'AD_Tab', ad_column: 'AD_Column', ad_val_rule: 'AD_Val_Rule', ad_element: 'AD_Element', ad_process: 'AD_Process' };
  const resolve = (fkTable, v) => {
    if (v == null || v === '') return null;
    if (idKey[fkTable] && idKey[fkTable][v] != null) return 'ref:' + idKey[fkTable][v];
    const t = fkTable, nm = NAMED[t];
    if (nm) {
      const r = sq(nm.sql, [v]);
      if (r && r.n) { const all = []; const st = seed.prepare(nm.by); st.bind([r.n]); while (st.step()) all.push(st.getAsObject().i); st.free(); if (all.length === 1 && all[0] === v) return 'existing:' + CASE[t] + ':' + r.n; }
    }
    const r = sq('SELECT ' + t + '_uu AS uu FROM ' + t + ' WHERE ' + t + '_id=?', [v]);
    if (r && r.uu) return 'existing:' + (CASE[t] || t) + ':uu=' + r.uu;
    throw new Error('value ' + v + ' of ' + fkTable + ' is neither a row of the bundle nor a row of the dictionary seed');
  };
  // AD_Column.AD_Element_ID is mandatory on a real server (the twin does not need it): each column name already in the dictionary uses that element; a new name gets a new element row
  const elemRows = [], elemSeen = {}, elemOf = {};
  const colTable = tables.ad_column;
  if (colTable) colTable.rows.forEach((r) => {
    const n = r.columnname; if (elemOf[n]) return;
    const hit = sq('SELECT ad_element_id AS i FROM ad_element WHERE columnname=?', [n]);
    if (hit) { elemOf[n] = 'existing:AD_Element:' + n; return; }
    elemOf[n] = 'ref:' + n; if (!elemSeen[n]) { elemSeen[n] = 1; elemRows.push({ columnname: n, name: r.name || n, printname: r.name || n, entitytype: r.entitytype || 'A' }); }
  });
  if (elemRows.length) { tables.ad_element = { table: 'ad_element', idCol: 'ad_element_id', rows: elemRows.map((e, i) => Object.assign({ ad_element_id: -1 - i }, e)) }; }
  const sheets = {};
  ORDER.forEach((t) => {
    const d = tables[t]; if (!d) return;
    idKey[t] = {};
    const first = d.rows.reduce((u, r) => Object.assign(u, Object.keys(r).reduce((o, k) => { if (!(k in u)) o[k] = 1; return o; }, {})), {}), cols = Object.keys(first).concat(t === 'ad_column' && !('ad_element_id' in first) ? ['ad_element_id'] : []).filter((c) => !SKIP.has(c) && (c !== d.idCol || t === 'ad_treenodemm') && !/_uu$/.test(c) && !(t === 'ad_ref_table' && c === 'ad_reference_id' && false));
    const aoa = [['Key'].concat(cols)];
    d.rows.forEach((row) => {
      const r = Object.assign({}, row);
      // foreign keys -> text, using the keys of rows already placed
      const idc = t === 'ad_treenodemm' ? null : d.idCol;   // a tree node's key IS the menu it places
      const fk = (c) => c !== idc && (/_id$/.test(c) || FK_TABLE[c]);
      const text = {};
      Object.keys(r).forEach((c) => {
        if (SKIP.has(c) || !fk(c) || r[c] == null) return;
        const ft = FK_TABLE[c] || c.replace(/_id$/, '');
        if (!tables[ft] && !ORDER.includes(ft)) { try { text[c] = resolve(ft, r[c]); } catch (e) { /* a plain number column (e.g. a sequence id): keep as is */ } return; }
        text[c] = resolve(ft, r[c]);
      });
      Object.assign(r, text);
      if (t === 'ad_column') r.ad_element_id = elemOf[r.columnname];
      // a pack creates a physical column only when the column says IsSyncDatabase=Y (ColumnElementHandler): the columns of a table this workbook CREATES, with no ColumnSQL, are physical
      if (t === 'ad_column' && typeof r.ad_table_id === 'string' && /^ref:/.test(r.ad_table_id) && !(r.columnsql && String(r.columnsql).trim())) r.issyncdatabase = 'Y';
      // a key made from the text of the rows it points at
      const kr = Object.assign({}, r); ['ad_reference_id', 'ad_window_id', 'ad_table_id', 'ad_tab_id', 'ad_column_id'].forEach((c) => { if (typeof kr[c] === 'string') kr[c] = kr[c].replace(/^ref:/, '').replace(/^existing:[A-Za-z_]+:(uu=)?/, ''); });
      let k = keyOf(t, kr); if (k == null) throw new Error('no key for ' + t);
      if (keys[t + '|' + k]) throw new Error('duplicate key ' + t + ' ' + k); keys[t + '|' + k] = 1;
      if (t !== 'ad_treenodemm') idKey[t][row[d.idCol]] = k;
      aoa.push([k].concat(cols.map((c) => (r[c] == null ? '' : r[c]))));
    });
    sheets[t] = aoa;
  });
  const wb = XLSX.utils.book_new();
  const plug = [['Name', 'Value'], ['id', manifest.id], ['name', manifest.name || ''], ['version', manifest.version || ''], ['description', manifest.description || '']];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(plug), 'Plugin');
  ORDER.forEach((t) => { if (sheets[t]) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets[t]), SHEET[t]); });
  fs.writeFileSync(out, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  console.log('§MANIFEST-XLSX wrote ' + path.relative(process.cwd(), out) + ' sheets=' + ORDER.filter((t) => sheets[t]).map((t) => t + ':' + (sheets[t].length - 1)).join(' '));
}
module.exports = { ORDER, SKIP, FK_TABLE, SHEET };
if (require.main === module) main(process.argv[2], process.argv[3]).catch((e) => { console.error('§MANIFEST-XLSX FAILED ' + e.message); process.exit(1); });
