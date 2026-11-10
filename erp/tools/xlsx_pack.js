// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// xlsx_pack.js — bim-compiler NEURO_SYMBOLIC_ORDER_CONTRACT.md §R.V item 12 (verb erp.pack), prompts/ERP_IDEMPIERE_UX_PARITY.md §BIMDOC-LEGACY.
// The ERP data-model WORKBOOK (see manifest_to_xlsx.js for the sheet format) -> (1) the metadata-only 2Pack zip, through the ONE Pack Out engine
// (erp/pipo_packgen.js, same headless page as gen_2pack.js), and (2) the Java model classes I_<Table> / X_<Table> of the tables the workbook creates.
//   node erp/tools/xlsx_pack.js <model.xlsx> --version x.y.z [--out <dir>] [--java <srcdir> --package org.kernel.bim.model]
//   --java alone (no --version) writes the Java and no pack. A released pack is immutable: the same version with different rows is REFUSED (gen_2pack.writePack).
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.join(__dirname, '..', '..');
const XLSX = require(path.join(REPO, 'erp', 'xlsx.mini.min.js'));
const { ORDER, SKIP, FK_TABLE, SHEET } = require('./manifest_to_xlsx.js');
const { writePack } = require('./gen_2pack.js');
const SHEET_TO_TABLE = {}; Object.keys(SHEET).forEach((t) => { SHEET_TO_TABLE[SHEET[t]] = t; });
const ROW_KEY_TABLE = (c) => FK_TABLE[c] || c.replace(/_id$/, '');

function readWorkbook(file) {
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer', raw: true });   // raw: SheetJS must not turn 007 into 7 or a date serial
  const plugin = {}; XLSX.utils.sheet_to_json(wb.Sheets.Plugin || {}, { header: 1, raw: true }).slice(1).forEach((r) => { plugin[r[0]] = r[1]; });
  const sheets = {};
  ORDER.forEach((t) => {
    const ws = wb.Sheets[SHEET[t]]; if (!ws) return;
    const a = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }), head = a[0];
    if (head[0] !== 'Key') throw new Error('sheet ' + SHEET[t] + ': the first column must be Key');
    sheets[t] = a.slice(1).filter((r) => String(r[0]) !== '').map((r) => { const o = { key: String(r[0]), values: {} }; head.slice(1).forEach((c, i) => { if (r[i + 1] !== '' && r[i + 1] != null) o.values[c] = r[i + 1]; }); return o; });
  });
  return { plugin, sheets };
}

// -------------------------------------------------------------------------------------------------- provides (the rows the pack engine declares)
async function toProvides(model, version) {
  const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'tests', 'node_modules', 'sql.js'));
  const SQL = await initSqlJs(), seed = new SQL.Database(fs.readFileSync(path.join(REPO, 'erp', 'ad_seed.db')));
  const find = (sql, p) => { const st = seed.prepare(sql); const out = []; try { st.bind(p); while (st.step()) out.push(st.getAsObject()); } finally { st.free(); } return out; };
  const BY = {
    AD_Table: 'SELECT ad_table_uu AS uu FROM ad_table WHERE tablename=?', AD_Window: 'SELECT ad_window_uu AS uu FROM ad_window WHERE name=?',
    AD_Tree: 'SELECT ad_tree_uu AS uu FROM ad_tree WHERE name=?', AD_Reference: 'SELECT ad_reference_uu AS uu FROM ad_reference WHERE name=?', AD_Element: 'SELECT ad_element_uu AS uu FROM ad_element WHERE columnname=?', AD_Menu: 'SELECT ad_menu_uu AS uu FROM ad_menu WHERE name=?',
    AD_Tab: "SELECT t.ad_tab_uu AS uu FROM ad_tab t JOIN ad_window w ON w.ad_window_id=t.ad_window_id WHERE w.name || '/' || t.name=?",
    AD_Column: "SELECT c.ad_column_uu AS uu FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE t.tablename || '.' || c.columnname=?" };
  const existing = (table, name) => {
    let uu; const m = /^uu=(.+)$/.exec(name);
    if (m) uu = m[1]; else {
      if (!BY[table]) throw new Error('existing:' + table + ':' + name + ' - no name lookup for ' + table + '; use existing:' + table + ':uu=<uuid>');
      const hit = find(BY[table], [name]); if (hit.length !== 1) throw new Error('existing:' + table + ':' + name + ' matches ' + hit.length + ' rows in the dictionary (need exactly 1)');
      uu = hit[0].uu;
    }
    return { table: table.toLowerCase(), uu };
  };
  const elements = [], declared = {};
  ORDER.forEach((t) => (model.sheets[t] || []).forEach((row) => {
    const key = t + '|' + row.key, vals = {};
    Object.keys(row.values).forEach((c) => {
      let v = row.values[c];
      if (typeof v === 'string' && /^ref:/.test(v)) { const rk = ROW_KEY_TABLE(c) + '|' + v.slice(4); if (!declared[rk]) throw new Error(SHEET[t] + ' "' + row.key + '" ' + c + ' refs "' + v.slice(4) + '", which is not an earlier row of ' + SHEET[ROW_KEY_TABLE(c)]); v = { ref: rk }; }
      else if (typeof v === 'string' && /^existing:/.test(v)) { const m = /^existing:([A-Za-z_]+):(.+)$/.exec(v); v = existing(m[1], m[2]); }
      vals[c] = v;
    });
    declared[key] = 1; elements.push({ key, table: t, values: vals });
  }));
  if (!model.plugin.id) throw new Error('sheet Plugin needs a row id');
  return { id: model.plugin.id, provides: { version, description: model.plugin.description || '', updateDictionary: false, elements } };
}

// -------------------------------------------------------------------------------------------------- Java model classes
const DT_TYPE = (id) => ([13, 18, 19, 30, 11, 21, 31, 32, 33, 35].includes(id) ? 'int' : [12, 22, 29, 37, 26].includes(id) ? 'dec' : id === 20 ? 'bool' : [15, 16, 24].includes(id) ? 'ts' : 'str');
const STDPO = ['AD_Client_ID', 'AD_Org_ID', 'IsActive', 'Created', 'CreatedBy', 'Updated', 'UpdatedBy'];
const HDR = '/******************************************************************************\n * Copyright (C) 2025-2026 Redhuan D. Oon <red1org@gmail.com>                 *\n * SPDX-License-Identifier: GPL-2.0-only                                      *\n * Generated from the ERP data-model workbook by erp/tools/xlsx_pack.js,      *\n * in the shape of iDempiere\'s own generated model classes. DO NOT EDIT.      *\n *****************************************************************************/\n';
async function generateJava(model, pkg) {
  const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'tests', 'node_modules', 'sql.js'));
  const SQL = await initSqlJs(), seed = new SQL.Database(fs.readFileSync(path.join(REPO, 'erp', 'ad_seed.db')));
  const refId = (name) => { const st = seed.prepare('SELECT ad_reference_id AS i FROM ad_reference WHERE name=?'); st.bind([name]); const r = st.step() ? st.getAsObject().i : null; st.free(); if (r == null) throw new Error('reference "' + name + '" not in the dictionary'); return r; };
  const out = {};
  (model.sheets.ad_table || []).forEach((T) => {
    const tn = T.values.tablename, cols = (model.sheets.ad_column || []).filter((c) => c.values.ad_table_id === 'ref:' + T.key);
    const info = cols.map((c) => { const rm = /^existing:AD_Reference:(.+)$/.exec(c.values.ad_reference_id || ''), name = c.values.columnname;
      let t = rm ? DT_TYPE(refId(rm[1])) : 'str'; if (/^ref:/.test(c.values.ad_reference_id || '')) t = 'str';   // a list or table reference of the workbook: the value is a code or an id; see ad_reference_id below
      return { n: name, l: c.values.name || name, t, std: STDPO.includes(name), key: name === tn + '_ID', uu: name === tn + '_UU' }; });
    const J = { int: 'int', bool: 'boolean', str: 'String', dec: 'BigDecimal', ts: 'Timestamp' };
    const acc = (n, t) => ({ get: t === 'bool' ? (n === 'IsActive' ? 'isActive' : 'is' + n.replace(/^Is(?=[A-Z])/, '')) : 'get' + n, set: 'set' + n });
    // I_
    const i = [HDR, 'package ' + pkg + ';\n\nimport java.math.BigDecimal;\nimport java.sql.Timestamp;\nimport org.compiere.model.MTable;\nimport org.compiere.util.KeyNamePair;\n',
      '/** Interface for ' + tn + ' */\npublic interface I_' + tn + '\n{\n', '    /** TableName=' + tn + ' */\n    public static final String Table_Name = "' + tn + '";\n',
      '    /** AD_Table_ID is per database: read from the dictionary, never typed */\n    public static final int Table_ID = MTable.getTable_ID(Table_Name);\n',
      '    KeyNamePair Model = new KeyNamePair(Table_ID, Table_Name);\n    /** AccessLevel = ' + (T.values.accesslevel || '3') + ' */\n    BigDecimal accessLevel = BigDecimal.valueOf(' + (T.values.accesslevel || '3') + ');\n'];
    const std = { AD_Client_ID: 'int', AD_Org_ID: 'int', IsActive: 'bool', Created: 'ts', CreatedBy: 'int', Updated: 'ts', UpdatedBy: 'int' };
    STDPO.filter((n) => !info.some((c) => c.n === n) || true).forEach((n) => { const t = std[n], a = acc(n, t), ro = ['AD_Client_ID', 'Created', 'CreatedBy', 'Updated', 'UpdatedBy'].includes(n);
      i.push('    /** Column name ' + n + ' */\n    public static final String COLUMNNAME_' + n + ' = "' + n + '";\n' + (ro ? '' : '    public void ' + a.set + ' (' + J[t] + ' ' + n + ');\n') + '    public ' + J[t] + ' ' + a.get + '();\n'); });
    info.filter((c) => !c.std).forEach((c) => { const a = acc(c.n, c.t);
      i.push('    /** Column name ' + c.n + ' */\n    public static final String COLUMNNAME_' + c.n + ' = "' + c.n + '";\n    /** Set ' + c.l + ' */\n    public void ' + a.set + ' (' + J[c.t] + ' ' + c.n + ');\n    /** Get ' + c.l + ' */\n    public ' + J[c.t] + ' ' + a.get + '();\n'); });
    i.push('}\n'); out['I_' + tn + '.java'] = i.join('');
    // X_
    const x = [HDR, 'package ' + pkg + ';\n\nimport java.math.BigDecimal;\nimport java.sql.ResultSet;\nimport java.sql.Timestamp;\nimport java.util.Properties;\nimport org.compiere.model.I_Persistent;\nimport org.compiere.model.PO;\nimport org.compiere.model.POInfo;\nimport org.compiere.util.Env;\n',
      '/** Generated-shape Model for ' + tn + ' */\n@org.adempiere.base.Model(table="' + tn + '")\npublic class X_' + tn + ' extends PO implements I_' + tn + ', I_Persistent\n{\n\tprivate static final long serialVersionUID = 1L;\n\n',
      '\t/** Standard Constructor */\n\tpublic X_' + tn + ' (Properties ctx, int ' + tn + '_ID, String trxName)\n\t{\n\t\tsuper (ctx, ' + tn + '_ID, trxName);\n\t}\n',
      '\t/** Standard Constructor */\n\tpublic X_' + tn + ' (Properties ctx, int ' + tn + '_ID, String trxName, String ... virtualColumns)\n\t{\n\t\tsuper (ctx, ' + tn + '_ID, trxName, virtualColumns);\n\t}\n',
      '\t/** Standard Constructor */\n\tpublic X_' + tn + ' (Properties ctx, String ' + tn + '_UU, String trxName)\n\t{\n\t\tsuper (ctx, ' + tn + '_UU, trxName);\n\t}\n',
      '\t/** Load Constructor */\n\tpublic X_' + tn + ' (Properties ctx, ResultSet rs, String trxName)\n\t{\n\t\tsuper (ctx, rs, trxName);\n\t}\n',
      '\t/** AccessLevel @return ' + (T.values.accesslevel || '3') + ' */\n\tprotected int get_AccessLevel()\n\t{\n\t\treturn accessLevel.intValue();\n\t}\n',
      '\t/** Load Meta Data */\n\tprotected POInfo initPO (Properties ctx)\n\t{\n\t\treturn POInfo.getPOInfo (ctx, Table_ID, get_TrxName());\n\t}\n'];
    const ident = info.filter((c) => !c.std && !c.key && !c.uu && c.t === 'str').slice(0, 2).map((c) => c.n);
    x.push('\tpublic String toString()\n\t{\n\t\treturn new StringBuilder ("X_' + tn + '[").append(get_ID())' + ident.map((n) => '.append(",' + n + '=").append(' + acc(n, 'str').get + '())').join('') + '.append("]").toString();\n\t}\n');
    info.filter((c) => !c.std).forEach((c) => { const a = acc(c.n, c.t), K = 'COLUMNNAME_' + c.n;
      if (c.t === 'int') x.push('\t/** Set ' + c.l + ' */\n\tpublic void ' + a.set + ' (int v)\n\t{\n\t\tif (v < 1)\n\t\t\t' + (c.key ? 'set_ValueNoCheck' : 'set_Value') + ' (' + K + ', null);\n\t\telse\n\t\t\t' + (c.key ? 'set_ValueNoCheck' : 'set_Value') + ' (' + K + ', Integer.valueOf(v));\n\t}\n\t/** Get ' + c.l + ' */\n\tpublic int ' + a.get + '()\n\t{\n\t\tInteger ii = (Integer)get_Value(' + K + ');\n\t\tif (ii == null)\n\t\t\t return 0;\n\t\treturn ii.intValue();\n\t}\n');
      else if (c.t === 'bool') x.push('\t/** Set ' + c.l + ' */\n\tpublic void ' + a.set + ' (boolean v)\n\t{\n\t\tset_Value (' + K + ', Boolean.valueOf(v));\n\t}\n\t/** Get ' + c.l + ' */\n\tpublic boolean ' + a.get + '()\n\t{\n\t\tObject oo = get_Value(' + K + ');\n\t\tif (oo != null) \n\t\t{\n\t\t\t if (oo instanceof Boolean) \n\t\t\t\t return ((Boolean)oo).booleanValue(); \n\t\t\treturn "Y".equals(oo);\n\t\t}\n\t\treturn false;\n\t}\n');
      else if (c.t === 'dec') x.push('\t/** Set ' + c.l + ' */\n\tpublic void ' + a.set + ' (BigDecimal v)\n\t{\n\t\tset_Value (' + K + ', v);\n\t}\n\t/** Get ' + c.l + ' */\n\tpublic BigDecimal ' + a.get + '()\n\t{\n\t\tBigDecimal bd = (BigDecimal)get_Value(' + K + ');\n\t\tif (bd == null)\n\t\t\t return Env.ZERO;\n\t\treturn bd;\n\t}\n');
      else if (c.t === 'ts') x.push('\t/** Set ' + c.l + ' */\n\tpublic void ' + a.set + ' (Timestamp v)\n\t{\n\t\tset_Value (' + K + ', v);\n\t}\n\t/** Get ' + c.l + ' */\n\tpublic Timestamp ' + a.get + '()\n\t{\n\t\treturn (Timestamp)get_Value(' + K + ');\n\t}\n');
      else x.push('\t/** Set ' + c.l + ' */\n\tpublic void ' + a.set + ' (String v)\n\t{\n\t\tset_Value (' + K + ', v);\n\t}\n\t/** Get ' + c.l + ' */\n\tpublic String ' + a.get + '()\n\t{\n\t\treturn (String)get_Value(' + K + ');\n\t}\n'); });
    x.push('}\n'); out['X_' + tn + '.java'] = x.join('');
  });
  return out;
}

// -------------------------------------------------------------------------------------------------- the pack, through the real page (as gen_2pack.js)
async function pack(manifest, outDir) {
  const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
  const http = require('http'), MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.sql': 'text/plain', '.css': 'text/css' };
  const server = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]), fp = path.join(REPO, p);
    fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); }); });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  try {
    const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
    page.on('console', (m) => { if (/^§PACKGEN/.test(m.text())) console.log(m.text()); });
    await page.goto('http://localhost:' + server.address().port + '/erp/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__idmpDb && !!window.PipoPackOut, null, { timeout: 60000 });
    await page.addScriptTag({ url: '/erp/pipo_packgen.js' });
    const r = await page.evaluate(async (m) => { try { const g = await window.PipoPackGen.generate(window.__idmpDb, m); return { file: g.file, xml: g.xml, zip: Array.from(g.zip), stat: g.stat }; } catch (e) { return { error: e.message }; } }, manifest);
    if (r.error) throw new Error(r.error);
    const file = path.join(outDir, r.file);
    return { file, xml: r.xml, status: writePack(file, Uint8Array.from(r.zip), r.xml), stat: r.stat };
  } finally { await browser.close(); server.close(); }
}

async function main(argv) {
  const a = { _: [] }; for (let i = 0; i < argv.length; i++) { if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[++i]; else a._.push(argv[i]); }
  if (!a._[0]) { console.error('usage: node erp/tools/xlsx_pack.js <model.xlsx> [--version x.y.z --out <dir>] [--java <srcdir> --package <pkg>]'); process.exit(2); }
  const model = readWorkbook(a._[0]); const rows = Object.keys(model.sheets).map((t) => SHEET[t] + ':' + model.sheets[t].length).join(' ');
  console.log('§XLSX-PACK read ' + path.basename(a._[0]) + ' plugin=' + model.plugin.id + ' ' + rows);
  if (a.java) {
    const pkg = a.package || 'org.kernel.bim.model', files = await generateJava(model, pkg), dir = path.resolve(a.java, pkg.replace(/\./g, '/'));
    fs.mkdirSync(dir, { recursive: true });
    Object.keys(files).forEach((f) => { const p = path.join(dir, f), same = fs.existsSync(p) && fs.readFileSync(p, 'utf8') === files[f]; if (!same) fs.writeFileSync(p, files[f]); console.log('§XLSX-PACK java ' + path.relative(process.cwd(), p) + ' ' + (same ? 'unchanged' : 'written') + ' lines=' + files[f].split('\n').length); });
  }
  if (a.version) {
    if (!/^\d+\.\d+\.\d+$/.test(a.version)) throw new Error('--version must be x.y.z');
    const m = await toProvides(model, a.version), r = await pack(m, path.resolve(a.out || '.'));
    const kinds = {}; (r.xml.match(/<(AD_\w+)\b/g) || []).forEach((t) => { kinds[t.slice(1)] = (kinds[t.slice(1)] || 0) + 1; });
    console.log('§XLSX-PACK zip ' + path.relative(process.cwd(), r.file) + ' ' + r.status + ' elements=' + m.provides.elements.length + ' records=' + r.stat.records);
    console.log('§XLSX-PACK classes ' + JSON.stringify((r.xml.match(/org\.kernel\.[\w.]+/g) || []).filter((v, i, s) => s.indexOf(v) === i)));
  }
}
module.exports = { readWorkbook, toProvides, generateJava, pack };
if (require.main === module) main(process.argv.slice(2)).catch((e) => { console.error('§XLSX-PACK FAILED ' + e.message); process.exit(1); });
