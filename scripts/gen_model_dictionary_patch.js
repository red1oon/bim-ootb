#!/usr/bin/env node
// ⚠ DO NOT REMOVE — scope: emits the §OBJ_DICT section of a building's self-heal patch (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §0.8).
//   READ the printed § lines after every run; an exit code is not evidence.
// What it does: the model's OWN dictionary as SQL (a patch, never a binary): `<table>_uu` generated key columns, the AD_Table / AD_Column / AD_Reference / AD_Ref_List /
//   AD_Window / AD_Tab / AD_Field rows for Building, Storey and Space, Element, Element Transform, and the dictionary tables' own DDL, copied from erp/ad_seed.db.
//   NOTHING IS INVENTED: column names, types and NOT NULL come from PRAGMA table_info of the given source databases; closed lists are the DISTINCT values found there (union of every source);
//   ids are in the model band 9550001-9559999 (bands in use by the ERP plugins: 9538001-9543999); every row carries a deterministic UU (md5 of its logical name), so a regeneration
//   gives the same bytes and two dictionaries can never be confused by id.
// Usage: node scripts/gen_model_dictionary_patch.js --patch buildings/patches/Duplex_extracted.db.sql --src <db> [--src <db2>]   (replaces the section between the markers, or appends it)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const initSqlJs = require('../modeller/lib/sql-wasm.js');
const BEGIN = '-- ═══ §OBJ_DICT begin', END = '-- ═══ §OBJ_DICT end';
const NOW = '2026-11-09 00:00:00', BAND0 = 9550001, BAND1 = 9559999;
const STD = { ad_client_id: 0, ad_org_id: 0, isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100, entitytype: 'U' };

// ── the objects (the only authored part: names and what links to what). Columns are read from the databases. ──
const OBJECTS = [
  { kind: 'Building', table: 'project_metadata', window: 'Building', desc: 'The building: its project facts (name, source file, import date)', keyFrom: 'key', hv: 'N', cols: { key: 'Fact', value: 'Value' } },
  { kind: 'Storey and Space', table: 'spatial_structure', window: 'Storey and Space', desc: 'A storey or a space of the building', keyFrom: 'guid', hv: 'N' },
  { kind: 'Element', table: 'elements_meta', window: 'Element', desc: 'A building element', keyFrom: 'guid', hv: 'Y', lists: { discipline: 'Model Discipline', ifc_class: 'Model IFC Class' } },
  { kind: 'Element Transform', table: 'element_transforms', window: 'Element', desc: 'Where an element is: centre, rotation and box (0..1 per element)', keyFrom: 'guid', hv: 'Y', parent: { table: 'elements_meta' }, tabLevel: 1 }
];
// spatial_structure is created by the patch itself (DROP+CREATE earlier in the same file), so its columns are fixed here from that statement
const SPATIAL_COLS = [['guid', 'TEXT'], ['type', 'TEXT'], ['name', 'TEXT'], ['parent_guid', 'TEXT'], ['object_type', 'TEXT'], ['predefined_type', 'TEXT'], ['center_x', 'REAL'], ['center_y', 'REAL'], ['center_z', 'REAL'],
  ['size_x', 'REAL'], ['size_y', 'REAL'], ['size_z', 'REAL'], ['room_guid', 'TEXT'], ['elevation', 'REAL']];
const q = (v) => v == null ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
const uu = (name) => { const h = crypto.createHash('md5').update('bim-model-dictionary:' + name).digest('hex'); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-5' + h.slice(13, 16) + '-a' + h.slice(17, 20) + '-' + h.slice(20, 32); };
const label = (c) => c.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()).replace(/\bUu\b/, 'UU').replace(/\bGuid\b/, 'GUID').replace(/\bIfc\b/, 'IFC');
const ins = (table, row) => { const k = Object.keys(row); return 'INSERT OR IGNORE INTO ' + table + ' (' + k.join(',') + ') VALUES (' + k.map((c) => q(row[c])).join(',') + ');'; };

(async () => {
  const a = process.argv.slice(2), arg = (f) => { const o = []; a.forEach((x, i) => { if (x === f) o.push(a[i + 1]); }); return o; };
  const patch = arg('--patch')[0], srcs = arg('--src');
  if (!patch || !srcs.length) { console.error('usage: --patch <file.sql> --src <db> [--src <db>]'); process.exit(2); }
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const dbs = srcs.map((s) => new SQL.Database(fs.readFileSync(s)));
  const rows = (db, sql) => { const r = db.exec(sql); return r.length ? r[0].values : []; };
  // physical columns of an object: from the first source that has the table, else (spatial_structure) the patch's own statement
  function physCols(o) {
    for (const db of dbs) { const r = rows(db, 'PRAGMA table_info(' + o.table + ')'); if (r.length) return r.map((c) => ({ name: c[1], type: c[2], notnull: c[3], pk: c[5] })).filter((c) => !/_uu$/i.test(c.name)); }
    if (o.table === 'spatial_structure') return SPATIAL_COLS.map(([n, t]) => ({ name: n, type: t, notnull: 0, pk: 0 }));
    throw new Error('no source has table ' + o.table);
  }
  const distinct = (o, col) => { const s = new Set(); dbs.forEach((db) => { try { rows(db, 'SELECT DISTINCT ' + col + ' FROM ' + o.table + ' WHERE ' + col + ' IS NOT NULL').forEach((r) => s.add(String(r[0]))); } catch (e) { /* table absent in this source */ } }); return [...s].sort(); };
  // ── ids in the band ──
  let nextId = BAND0; const take = () => { const v = nextId++; if (v > BAND1) throw new Error('model band exhausted'); return v; };
  const out = [], T = [], C = [], R = [], L = [], W = [], TB = [], F = [];
  const alters = [];
  const winIds = {}, tabIds = {}, tblIds = {}, colIds = {};
  // seed DDL of the dictionary tables themselves (exact statements of the ERP seed: one schema, never hand-copied)
  const seed = new SQL.Database(fs.readFileSync(path.join(__dirname, '..', 'erp', 'ad_seed.db')));
  const ddl = ['AD_Table', 'AD_Column', 'AD_Reference', 'AD_Ref_List', 'AD_Window', 'AD_Tab', 'AD_Field', 'ad_attachment'].map((n) => { const r = rows(seed, "SELECT sql FROM sqlite_master WHERE type='table' AND lower(name)=lower('" + n + "')"); if (!r.length) throw new Error('seed has no ' + n); return r[0][0].replace(/^CREATE TABLE (IF NOT EXISTS )?/, 'CREATE TABLE IF NOT EXISTS ').replace(/\n/g, ' ') + ';'; });
  const listRefs = {};
  OBJECTS.forEach((o) => {
    o.id = take(); tblIds[o.table] = o.id;
    if (!winIds[o.window]) winIds[o.window] = take();
  });
  OBJECTS.forEach((o) => {
    o.phys = physCols(o); o.uuCol = o.table + '_uu';
    // generated columns: the key (always), and for a child the link to its parent's key
    alters.push('ALTER TABLE ' + o.table + ' ADD COLUMN ' + o.uuCol + ' TEXT GENERATED ALWAYS AS (' + o.keyFrom + ') VIRTUAL;');
    if (o.parent) alters.push('ALTER TABLE ' + o.table + ' ADD COLUMN ' + o.parent.table + '_uu TEXT GENERATED ALWAYS AS (' + o.keyFrom + ') VIRTUAL;');
    T.push(Object.assign({ ad_table_id: o.id, name: o.kind, description: o.desc, tablename: o.table, isview: 'N', accesslevel: '3', ad_window_id: winIds[o.window], isdeleteable: 'N', ishighvolume: o.hv,
      ischangelog: 'Y', replicationtype: 'L', iscentrallymaintained: 'Y', ad_table_uu: uu('ad_table:' + o.table) }, STD));
    const cols = [];
    o.phys.forEach((c) => cols.push({ name: c.name, type: c.type, mandatory: c.notnull || c.pk ? 'Y' : 'N', key: false, parent: false, ro: c.name === o.keyFrom }));
    cols.push({ name: o.uuCol, type: 'TEXT', mandatory: 'N', key: true, parent: false, ro: true, gen: true });
    if (o.parent) cols.push({ name: o.parent.table + '_uu', type: 'TEXT', mandatory: 'N', key: false, parent: true, ro: true, gen: true });
    o.cols2 = cols;
    cols.forEach((c, i) => {
      const id = take(); colIds[o.table + '.' + c.name] = id;
      let ref = c.type === 'REAL' ? 22 : c.type === 'INTEGER' ? 11 : 10, refVal = null;
      const listName = o.lists && o.lists[c.name];
      if (listName) {
        ref = 17;
        if (!listRefs[listName]) {
          const rid = take(); listRefs[listName] = rid;
          R.push(Object.assign({ ad_reference_id: rid, name: listName, description: 'Values found in the model for ' + o.table + '.' + c.name, validationtype: 'L', isorderbyvalue: 'N', ad_reference_uu: uu('ad_reference:' + listName) }, STD));
          distinct(o, c.name).forEach((v) => L.push(Object.assign({ ad_ref_list_id: take(), ad_reference_id: rid, value: v, name: v, description: null, ad_ref_list_uu: uu('ad_ref_list:' + listName + ':' + v) }, STD)));
        }
        refVal = listRefs[listName];
      }
      const lbl = (o.cols && o.cols[c.name]) || label(c.name);
      c.id = id; c.ref = ref; c.refVal = refVal; c.label = lbl;
      C.push(Object.assign({ ad_column_id: id, ad_table_id: o.id, columnname: c.name, name: lbl, description: c.gen ? 'Generated key ' + c.name + ' = ' + o.keyFrom + ' (legacy <Table>_UU rule)' : null, ad_reference_id: ref, ad_reference_value_id: refVal,
        fieldlength: ref === 22 ? 22 : 255, iskey: c.key ? 'Y' : 'N', isparent: c.parent ? 'Y' : 'N', ismandatory: c.mandatory, isupdateable: c.ro ? 'N' : 'Y', isidentifier: (c.name === 'name' || c.name === 'element_name' || c.key) ? 'Y' : 'N',
        seqno: c.name === 'name' || c.name === 'element_name' ? 1 : 0, istranslated: 'N', isencrypted: 'N', isselectioncolumn: 'N', issyncdatabase: 'N', isalwaysupdateable: 'N', isallowlogging: c.gen ? 'N' : 'Y', isallowcopy: 'N',
        ad_column_uu: uu('ad_column:' + o.table + '.' + c.name), version: 0 }, STD));
    });
  });
  Object.keys(winIds).forEach((w) => {
    const first = OBJECTS.filter((o) => o.window === w)[0];
    W.push(Object.assign({ ad_window_id: winIds[w], name: w, description: first.desc, windowtype: 'M', issotrx: 'N', isdefault: 'N', ad_window_uu: uu('ad_window:' + w) }, STD));
  });
  let seqT = 0;
  OBJECTS.forEach((o) => {
    const tid = take(); tabIds[o.table] = tid;
    const parentTab = o.parent ? tabIds[o.parent.table] : null;
    TB.push(Object.assign({ ad_tab_id: tid, ad_window_id: winIds[o.window], name: o.kind, description: o.desc, ad_table_id: o.id, seqno: (seqT += 10), tablevel: o.tabLevel || 0, issinglerow: o.parent ? 'Y' : 'N', isinfotab: 'N', istranslationtab: 'N',
      isreadonly: 'N', hastree: 'N', issorttab: 'N', isinsertrecord: 'N', isadvancedtab: 'N', ishighvolume: o.hv, ad_tab_uu: uu('ad_tab:' + o.table) }, STD));
    let k = 0;
    o.cols2.forEach((c) => {
      F.push(Object.assign({ ad_field_id: take(), ad_tab_id: tid, ad_column_id: c.id, name: c.label, iscentrallymaintained: 'Y', isdisplayed: c.key || c.parent ? 'N' : 'Y', isreadonly: c.ro ? 'Y' : 'N', seqno: (++k) * 10,
        issameline: 'N', isheading: 'N', isfieldonly: 'N', isencrypted: 'N', ad_field_uu: uu('ad_field:' + o.table + '.' + c.name) }, STD));
    });
  });
  const cnt = { ad_table: T.length, ad_column: C.length, ad_reference: R.length, ad_ref_list: L.length, ad_window: W.length, ad_tab: TB.length, ad_field: F.length };
  const body = [BEGIN + ' (generated by scripts/gen_model_dictionary_patch.js; band ' + BAND0 + '-' + BAND1 + '; spec prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §0.8) ═══',
    '-- The model carries its own dictionary: the generated <table>_uu keys (legacy MTable.isUUIDKeyTable / PO.getUUIDColumnName) and the AD rows of its own tables. Dictionary rows only; no model data row is touched.',
    '-- A repeated ALTER ... ADD COLUMN raises "duplicate column name"; the shared chunker (viewer/scene.js A._runSqlChunked) skips exactly that error, so the section is idempotent.',
    ...ddl, ...alters,
    ...R.map((r) => ins('ad_reference', r)), ...L.map((r) => ins('ad_ref_list', r)), ...T.map((r) => ins('ad_table', r)), ...C.map((r) => ins('ad_column', r)),
    ...W.map((r) => ins('ad_window', r)), ...TB.map((r) => ins('ad_tab', r)), ...F.map((r) => ins('ad_field', r)),
    END + ' ═══', ''].join('\n');
  let cur = fs.existsSync(patch) ? fs.readFileSync(patch, 'utf8') : '';
  const b = cur.indexOf(BEGIN), e = cur.indexOf(END);
  if (b >= 0 && e > b) cur = cur.slice(0, b) + body + cur.slice(cur.indexOf('\n', e) + 1);
  else cur = cur.replace(/\n*$/, '\n') + '\n' + body;
  fs.writeFileSync(patch, cur);
  console.log('§OBJ_DICT_GEN patch=' + patch + ' band=' + BAND0 + '..' + (nextId - 1) + ' ' + Object.keys(cnt).map((k) => k + '=' + cnt[k]).join(' ') + ' alters=' + alters.length + ' sources=' + srcs.length + ' bytes=' + body.length);
})().catch((e) => { console.error('§OBJ_DICT_GEN FAILED ' + e.stack); process.exit(1); });
