#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — the ERP's command line for the one door, lane B (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §0.4 detail 2, lane B SPEC). Read the §ERP lines after every run; an exit code is not evidence.
// WHAT IT IS: three generic commands over the Kernel ERP's own engine and dictionary. NO table is named here (AD-LAYER LAW): a document kind is an AD_Table that has a DocAction column; its key, number column
//   and related documents come from AD_Column; its DocAction class is whatever ModelLayer.docActionFor(table) holds.
//     find     --kind K --number N        the window's Find by document number (else Name/Value): key, number, DocStatus, DocAction, doctype
//     actions  --kind K --id I [--role R] the legal actions of that record's state (DocumentEngine.getValidActions), then the role's Document Action Access when --role is given (erp/doc_actions.js)
//     describe --kind K                   reflection over the dictionary: properties, child tabs (object_cli's describe, over the ERP's AD rows; any AD table, document or not)
//     read     --kind K (--id I | --number N)   one record by its key or its number (the one resolver, recordOf), with its single-row child tabs (object_cli's read)
//     complete|void|close|reverse --kind K --id I [--role R]   DocAction CO|VO|CL|RC (DocumentEngine constants) through ModelLayer.run (DocumentEngine.processIt) = the twin of legacy's action; --role refuses what that role is not offered
//   Writes never touch the .db: each op is appended to the op-log (JSONL; --oplog, else $BIM_OBJECT_OPLOG, else ~/.cache/bim_object/<db>.ops.jsonl, the object layer's own log) and replayed on every run.
//   The .db is the shipped erp/ad_seed.db (--db, else $ERP_SEED_DB, to name another: a witness's fixture copy with its patches/ folder beside it); it is opened into memory, never written.
// Exit: 0 ok · 3 refused (an answer: not found, not offered, the engine said no) · 1 error · 2 usage.
// Run: node common/door/erp_cli.js find --kind "Order" --number 50000
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const OC = require('./object_cli.js');
const say = (s) => process.stderr.write('§ERP ' + s + '\n');
const BREAK = process.env.ERP_BREAK || '';   // witness falsifiers: 'actor' (the answer depends on who asks) · 'norole' (the role filter is skipped) · 'wrongcode' (close runs the void action) · 'firstmatch' (an ambiguous number takes the first) · 'neighbour' (a number resolves to the next record)
class Refused extends Error {}
// The door's clock for what a record stores (Created, Updated, a document's dates): the LOCAL day and time, as the page writes them (crud_core.js localDay; ad_callout.js RUNTIME.now) and as legacy's
// server does. toISOString() alone is UTC: before 08:00 in Kuala Lumpur it names yesterday (the defect of bim-ootb prompts/CAPEX_DASHBOARD.md §5.24, which had not reached this file). An op's own `t` stays an instant in UTC.
const localIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString(), stamp = () => localIso().replace('T', ' ').slice(0, 19), today = () => localIso().slice(0, 10);
const refuse = (m) => { throw new Refused(m); };

// ── the host glue every ERP host needs once: model classes, callout runtime, SQL functions ──
function loadEngine(O) {
  const E = path.join(ROOT, 'erp');
  const log = console.log; console.log = () => {};   // the engine modules print their own § lines to stdout; stdout here carries only the answer
  try {
    require(path.join(E, 'model_layer.js'));
    ['model_initial_defaults', 'model_trade', 'model_ctor', 'model_cost', 'model_match', 'model_order', 'model_invoice', 'model_master', 'model_rma', 'model_project', 'model_asi', 'model_dd', 'model_movement', 'model_inventory', 'model_pa', 'model_post']
      .forEach(m => { try { require(path.join(E, m + '.js')); } catch (e) { say('LOAD-SKIP ' + m + ': ' + e.message); } });
    const A = require(path.join(E, 'ad_callout.js'));
    ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(m => { try { require(path.join(E, 'callouts', m + '.js')); } catch (e) { say('LOAD-SKIP callouts/' + m + ': ' + e.message); } });
    fs.readdirSync(path.join(E, 'callouts')).filter(f => /^(Callout|CostAdj|InOutFreight)/.test(f)).forEach(f => { try { require(path.join(E, 'callouts', f)); } catch (e) { say('LOAD-SKIP callouts/' + f + ': ' + e.message); } });
    let udf = 0; require(path.join(E, 'db_export_safe.js')).register(O.db, 'core-udf', d => A.RUNTIME.registerSqlFunctions((nm, f) => { d.create_function(nm, f); udf++; }));   // §EXPORTSAFE: re-bound after every db.export() (the snapshot below)   // the page does the same (idempiere.html :1175); sql.js takes the arity from f.length
    A.bind((s, p) => O.rows(s, p), { log: () => {} });
    O.udf = udf;
  } finally { console.log = log; }
  return O;
}
// a better-sqlite3-style handle over the sql.js one (idempiere.html _b3w :1089): lower-case columns, .get/.all with positional args
function b3(O) {
  const lc = (o) => { const r = {}; for (const k in o) r[k.toLowerCase()] = o[k]; return r; };
  return { prepare: (sql) => ({
    get: (...a) => { const st = O.db.prepare(sql); try { if (a.length) st.bind(a); return st.step() ? lc(st.getAsObject()) : undefined; } finally { st.free(); } },
    all: (...a) => { const st = O.db.prepare(sql), out = []; try { if (a.length) st.bind(a); while (st.step()) out.push(lc(st.getAsObject())); return out; } finally { st.free(); } }
  }) };
}
// §0.16 the patched image (seed + the page's self-heal patch) is the same for every call until the seed or a patch file changes: it is computed once and kept under a key of their bytes.
// ERP_SNAPSHOT=off restores the per-call patch. The op-log replay and everything after it are unchanged. Witness: common/door/tests/witness_erp_snapshot.js (W-ERP-SNAPSHOT).
const SNAP_VERSION = 'erp-snapshot/1 split=;\\s*\\n strip=--line run=one-by-one failing=skipped';   // the apply loop's contract; change it when the loop below changes
function patchFiles(seed) { return [path.basename(seed) + '.sql', 'mfg.sql'].map(f => path.join(path.dirname(seed), 'patches', f)).filter(f => fs.existsSync(f)); }
function snapshotKey(seed) {
  const h = require('crypto').createHash('sha256'); h.update(SNAP_VERSION); h.update(fs.readFileSync(seed));
  if ((process.env.ERP_BREAK || '') !== 'stalesnap') patchFiles(seed).forEach(f => { h.update('\n' + path.basename(f) + '\n'); h.update(fs.readFileSync(f)); });   // falsifier: a key blind to the patch
  return h.digest('hex').slice(0, 32);
}
function applyPatch(O, seed) {   // same loop as idempiere.html :1160-1169: statements one by one, a failing one never blocks (the bundled wasm cannot take the file in one run)
  let pOk = 0, pFail = 0;
  patchFiles(seed).forEach(pf => { fs.readFileSync(pf, 'utf8').split(/;\s*\n/).forEach(st => { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { O.db.run(st); pOk++; } catch (e) { pFail++; } }); });
  return { pOk, pFail };
}
async function boot(a) {
  const seed = a.db || process.env.ERP_SEED_DB || path.join(ROOT, 'erp', 'ad_seed.db'), t0 = Date.now(), off = process.env.ERP_SNAPSHOT === 'off';
  // the page's self-heal patch comes BEFORE the op-log replay (an op may write a table only the patch creates, e.g. m_storagereservationlog)
  let O, how = 'off', key = '-';
  if (!off) {
    key = snapshotKey(seed); const dir = process.env.ERP_SNAPSHOT_DIR || path.join(require('os').homedir(), '.cache', 'bim_erp'), snap = path.join(dir, path.basename(seed).replace(/\.db$/, '') + '-' + key + '.db');
    if (fs.existsSync(snap)) { O = await OC.open({ db: snap }); O.file = seed; how = 'hit'; }
    else {
      O = await OC.open({ db: seed }); const r = applyPatch(O, seed); how = 'miss';
      try { fs.mkdirSync(dir, { recursive: true }); const tmp = snap + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, Buffer.from(O.db.export())); fs.renameSync(tmp, snap); } catch (e) { how = 'miss-unsaved:' + e.message; }
      say('patch statements=' + r.pOk + ' failed=' + r.pFail);
    }
  } else { O = await OC.open({ db: seed }); const r = applyPatch(O, seed); say('patch statements=' + r.pOk + ' failed=' + r.pFail); }
  say('snapshot=' + how + ' key=' + key + ' ms=' + (Date.now() - t0));
  O.opfile = OC.oplogFile({ oplog: a.oplog }, O.file); O.ops = OC.readOps(O.opfile);
  const known = {}; O.rows("SELECT lower(name) AS n FROM sqlite_master WHERE type='table'").forEach(r => { known[r.n] = 1; });
  O.ops.forEach(o => { const t = String(o.table || '').toLowerCase(); if (t && !known[t]) { ensureTables(O).forEach(n => { known[n] = 1; }); known[t] = 1; } OC.applyOp(O.db, O.rows, o); });   // an op on a table a staged window brought: its physical table is made first (§10)
  ensureTables(O);
  O.ML = require(path.join(ROOT, 'erp', 'model_layer.js')); O.dbId = 'model:' + path.basename(O.file);
  O.trx = () => new O.ML.Trx((sql, p) => O.rows(sql, p), { db: O.dbId, now: stamp(), uuid: () => require('crypto').randomUUID() });
  loadEngine(O); O.b3 = b3(O);
  say('boot db=' + path.basename(O.file) + ' replayed_ops=' + O.ops.length + ' oplog=' + O.opfile + ' sql_functions=' + O.udf);
  return O;
}

// ── mis.add_window (bim-compiler prompts/ERP_MIS_WINDOW_FROM_CSV.md §10) ──
const ADDWIN_BREAK = process.env.ADDWIN_BREAK || '';   // W-MIS-ADD falsifiers: nofield | notable | bare
// The physical table of a STAGED AD_Table (EntityType U, id in the Ninja range) that has none, from its AD_Column rows, by NinjaStage.dataTableSql (the one rule). Returns the lower-case names it made.
// The seed's own user-made kinds that ship with no table (MP_*) are left as they are: the page says "not in this seed" for them and this step must not change that.
function ensureTables(O) {
  if (ADDWIN_BREAK === 'notable') return [];
  const NS = require(path.join(ROOT, 'erp', 'ninja_stage.js')), made = [];
  O.rows("SELECT t.ad_table_id AS id, t.tablename AS tn FROM ad_table t WHERE t.isactive='Y' AND t.entitytype='U' AND t.ad_table_id>=" + NS.NINJA_BASE + " AND COALESCE(t.isview,'N')<>'Y' AND NOT EXISTS (SELECT 1 FROM sqlite_master m WHERE m.type IN ('table','view') AND lower(m.name)=lower(t.tablename))").forEach(t => {
    const cols = O.rows("SELECT columnname AS name, ad_reference_id AS refId FROM ad_column WHERE ad_table_id=? AND isactive='Y' AND (columnsql IS NULL OR columnsql='') ORDER BY ad_column_id", [t.id]).map(c => ({ name: c.name, refId: Number(c.refid) }));
    if (!cols.length) return;
    O.db.run(NS.dataTableSql(t.tn, cols)); made.push(t.tn.toLowerCase()); say('table-made ' + t.tn + ' columns=' + cols.length + ' (from its AD_Column rows)');
  });
  return made;
}
const AD_STAGED = ['ad_window', 'ad_table', 'ad_tab', 'ad_column', 'ad_field', 'ad_menu'], STD7 = ['ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby', 'updated', 'updatedby'];
async function addWindow(O, a) {
  const t0 = Date.now(), NS = require(path.join(ROOT, 'erp', 'ninja_stage.js')), NC = require(path.join(ROOT, 'erp', 'ninja_csv.js')), XL = require(path.join(ROOT, 'erp', 'xlsx.mini.min.js')), PG = require(path.join(ROOT, 'erp', 'pipo_packgen.js'));
  if (typeof globalThis.crypto === 'undefined') globalThis.crypto = require('crypto').webcrypto;   // pipo_packgen.uuidV5 uses the web crypto the page has; Node before 19 does not name it globally
  if (!a.file) refuse('--file is required (a .csv of the table\'s properties)');
  if (!/\.csv$/i.test(String(a.file))) refuse('the file must be a .csv: ' + a.file);
  const base = process.cwd(), abs = path.resolve(base, String(a.file)), rel = path.relative(base, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) refuse('the file must be in the folder the line is run from (' + base + '); "' + a.file + '" leaves it. Nothing was written');
  let text; try { text = fs.readFileSync(abs, 'utf8'); } catch (e) { refuse('cannot read ' + a.file + ': ' + (e.code || e.message)); }
  const sha = require('crypto').createHash('sha256').update(text).digest('hex'), table = String(a.table || path.basename(abs).replace(/\.csv$/i, ''));
  if (a.master) refuse('master= is not built yet: a detail tab is staged together with its master (ERP_MIS_WINDOW_FROM_CSV §10, step M2b). Nothing was written');
  const ent = (tn) => { const r = O.rows('SELECT entitytype AS e FROM ad_table WHERE lower(tablename)=lower(?)', [tn])[0]; return r ? (r.e == null ? '' : r.e) : null; };
  const R = NC.fromText(text, XL, { table, workflow: a.workflow, name: a.name, existing: ent });
  if (!R.ok) refuse(R.refusals.length + ' fault' + (R.refusals.length > 1 ? 's' : '') + ' in ' + a.file + ': ' + R.refusals.map(x => (x.row ? 'line ' + x.row + ' ' : '') + x.column + (x.cell ? ' "' + x.cell + '"' : '') + ': ' + x.why).join(' | ') + '. Nothing was written');
  if (ent(table) != null) refuse(table + ' is already a window here; changing a staged window is not built yet. Nothing was written');
  const T = R.model.tables[0], user = T.columns.filter(c => !c.isStandard);
  // list values: VALUE=Name as stated; a bare name follows Ninja (Value = the name's first two characters, NewEmptyTable.java L222)
  const lists = user.filter(c => c.listValues && c.listValues.length).map(c => {
    const items = c.listValues.map((v, i) => { const nm = c.listNames ? c.listNames[i] : ''; return nm ? { value: v, name: nm } : { value: v.substring(0, v.length < 2 ? 1 : 2), name: v }; });
    const seen = {}; items.forEach(it => { if (seen[it.value]) refuse('list ' + c.name + ': "' + seen[it.value] + '" and "' + it.name + '" both get the value "' + it.value + '" (a name alone takes its first two characters, as Ninja does); write them as VALUE=Name. Nothing was written'); seen[it.value] = it.name; });
    const clash = O.rows("SELECT ad_reference_id AS id FROM ad_reference WHERE name=? AND validationtype='L'", [c.name])[0];
    if (clash) refuse('a list reference named ' + c.name + ' already exists (AD_Reference ' + clash.id + '); Ninja would reuse one whose name starts with the column name, which is not reproduced here: rename the column. Nothing was written');
    return { col: c.name, items };
  });
  const dry = String(a.dry || '').toUpperCase() === 'Y';
  if (dry) { say('add_window DRY table=' + table + ' columns=' + user.map(c => c.name).join(',') + ' sha256=' + sha.slice(0, 12)); return { dry: true, table, file: a.file, sha256: sha, columns: user.map(c => ({ name: c.name, reference: c.refId, mandatory: !!c.mandatory })), standard: T.columns.filter(c => c.isStandard).map(c => c.name), lists: lists.map(l => ({ column: l.col, values: l.items.map(i => i.value) })), ops: [] }; }
  // 1. the one stager, in a savepoint: read back what it made, then undo it (the rows are written as ops below, so they replay)
  const ids = (t) => { const m = {}; O.rows('SELECT ' + t + '_id AS id, isactive AS a FROM ' + t + ' WHERE ' + t + '_id>=' + NS.NINJA_BASE).forEach(r => { m[r.id] = r.a; }); return m; };
  const nodes = () => { const m = {}; O.rows('SELECT ad_tree_id AS t, node_id AS n FROM ad_treenodemm WHERE node_id>=' + NS.NINJA_BASE).forEach(r => { m[r.t + '/' + r.n] = 1; }); return m; };
  const before = {}, made = {}, ups = []; AD_STAGED.forEach(t => { before[t] = ids(t); }); const nb = nodes();
  const log = console.log; console.log = () => {};
  O.db.run('SAVEPOINT addwin'); let counts;
  try {
    counts = NS.stageModels(O.db, R.model, 0);
    AD_STAGED.forEach(t => { const now = ids(t); made[t] = Object.keys(now).filter(id => !(id in before[t])).map(id => O.rows('SELECT * FROM ' + t + ' WHERE ' + t + '_id=?', [Number(id)])[0]); Object.keys(now).forEach(id => { if (id in before[t] && before[t][id] !== now[id]) ups.push({ t, id: Number(id), old: before[t][id], neu: now[id] }); }); });
    made.ad_treenodemm = O.rows('SELECT * FROM ad_treenodemm WHERE node_id>=' + NS.NINJA_BASE).filter(r => !nb[r.ad_tree_id + '/' + r.node_id]);
  } finally { O.db.run('ROLLBACK TO addwin'); O.db.run('RELEASE addwin'); console.log = log; }
  // 2. what stageModels leaves empty, each from its legacy owner (§10's table)
  const has = {}, hasCol = (t, c) => (has[t] || (has[t] = O.rows('PRAGMA table_info(' + t + ')').map(x => x.name.toLowerCase()))).indexOf(c) >= 0;
  const uu = (t, key) => PG.uuidV5('ninja/' + table + '/' + t + '/' + key), bare = ADDWIN_BREAK === 'bare';
  const src = {}; O.rows("SELECT lower(columnname) AS c, ismandatory, isupdateable, isallowcopy, defaultvalue FROM ad_column WHERE ad_table_id=102").forEach(r => { src[r.c] = r; });   // NewEmptyTable.java L95, L262: the standard columns are copies of AD_Reference's
  const colName = {}; made.ad_column.forEach(c => { colName[c.ad_column_id] = c.columnname; });
  const dress = async (t, row, key) => {
    const f = {}; Object.keys(row).forEach(k => { if (row[k] != null) f[k] = row[k]; });
    if (bare) return f;
    if (hasCol(t, 'entitytype')) f.entitytype = 'U';
    if (hasCol(t, 'ad_client_id') && f.ad_client_id == null) f.ad_client_id = 0;
    if (hasCol(t, 'ad_org_id') && f.ad_org_id == null) f.ad_org_id = 0;
    if (hasCol(t, t + '_uu')) f[t + '_uu'] = await uu(t, key);
    return f;
  };
  const ops = [], refAt = {};
  if (!bare) for (const l of lists) {   // the reference first: the column points at it (NewEmptyTable.java L196-226)
    refAt[l.col] = ops.length;
    ops.push({ op_type: 'CRUD_CREATE', table: 'ad_reference', idCol: 'ad_reference_id', fields: { name: l.col, validationtype: 'L', entitytype: 'U', isactive: 'Y', ad_client_id: 0, ad_org_id: 0, ad_reference_uu: await uu('ad_reference', l.col) } });
    for (const it of l.items) ops.push({ op_type: 'CRUD_CREATE', table: 'ad_ref_list', idCol: 'ad_ref_list_id', fields: { ad_reference_id: { __opRef: refAt[l.col] }, value: it.value, name: it.name, entitytype: 'U', isactive: 'Y', ad_client_id: 0, ad_org_id: 0, ad_ref_list_uu: await uu('ad_ref_list', l.col + '/' + it.value) } });
  }
  for (const t of AD_STAGED) {
    if (t === 'ad_field' && ADDWIN_BREAK === 'nofield') continue;
    for (const row of made[t]) {
      const key = t === 'ad_column' ? row.columnname : t === 'ad_field' ? colName[row.ad_column_id] : t === 'ad_menu' ? (row.issummary === 'Y' ? 'summary/' + row.name : table) : table;
      if (!bare && t === 'ad_field' && /^(created|createdby|updated|updatedby)$/i.test(key)) continue;   // core TabCreateFields.java L99 (and Ninja AddTable.java L546-548): no field for Created* / Updated*
      const f = await dress(t, row, key);
      if (!bare && t === 'ad_field' && (key.toLowerCase() === table.toLowerCase() + '_id' || key.toLowerCase() === table.toLowerCase() + '_uu')) { f.isdisplayed = 'N'; if (hasCol('ad_field', 'isdisplayedgrid')) f.isdisplayedgrid = 'N'; }   // TabCreateFields.java L156-158: the key and the UU are not shown
      if (!bare && t === 'ad_table') { f.accesslevel = '3'; f.isdeleteable = 'Y'; }   // MRO_ModelMaker.java L128-129
      if (!bare && t === 'ad_column') {
        const lc = row.columnname.toLowerCase(), m = T.columns.filter(c => c.name === row.columnname)[0] || {};
        if (STD7.indexOf(lc) >= 0 && src[lc]) { f.ismandatory = src[lc].ismandatory; f.isupdateable = src[lc].isupdateable; f.isallowcopy = src[lc].isallowcopy; if (src[lc].defaultvalue != null) f.defaultvalue = src[lc].defaultvalue; }
        else if (row.iskey === 'Y') { f.ismandatory = 'Y'; f.isupdateable = 'N'; f.isallowcopy = 'N'; }   // NewEmptyTable.java L87-90; MColumn.beforeSave L457, L491
        else if (lc === table.toLowerCase() + '_uu') { const u = src.ad_reference_uu || {}; f.ismandatory = u.ismandatory || 'N'; f.isupdateable = u.isupdateable || 'Y'; f.isallowcopy = u.isallowcopy || 'N'; }
        else {
          f.isupdateable = 'Y'; f.isallowcopy = 'Y'; f.ismandatory = m.mandatory ? 'Y' : 'N';   // NewEmptyTable.java L244, L173; the sheet's Mandatory is the user's data
          if (m.length) f.fieldlength = m.length; if (m.identifier) f.isidentifier = 'Y'; if (m.defaultValue != null) f.defaultvalue = m.defaultValue; if (m.help) f.help = m.help;
          if (refAt[row.columnname] != null) f.ad_reference_value_id = { __opRef: refAt[row.columnname] };
        }
      }
      ops.push({ op_type: 'CRUD_CREATE', table: t, idCol: t + '_id', fields: f });
    }
  }
  for (const row of made.ad_treenodemm) ops.push({ op_type: 'CRUD_CREATE', table: 'ad_treenodemm', fields: await dress('ad_treenodemm', row, 'node/' + row.node_id) });
  ups.forEach(u => ops.push({ op_type: 'CRUD_UPDATE', table: u.t, idCol: u.t + '_id', id: u.id, changes: { isactive: { old: u.old, new: u.neu } } }));
  const win = made.ad_window[0];
  if (!bare && win) for (const r of O.rows("SELECT ad_role_id AS id, ad_client_id AS c FROM ad_role WHERE isactive='Y' AND ismanual='N' ORDER BY ad_role_id"))   // MWindow.afterSave L233-246, MWindowAccess L89-96
    ops.push({ op_type: 'CRUD_CREATE', table: 'ad_window_access', fields: { ad_window_id: win.ad_window_id, ad_role_id: r.id, ad_client_id: r.c, ad_org_id: 0, isactive: 'Y', isreadwrite: 'Y', ad_window_access_uu: await uu('ad_window_access', 'role/' + r.id) } });
  const res = persistGroup(O, ops), mk = ensureTables(O);
  say('add_window table=' + table + ' slot=' + counts.slot + ' window=' + (win && win.ad_window_id) + ' ops=' + res.length + ' ' + JSON.stringify(sum(res)) + ' table_made=' + mk.join(',') + ' sha256=' + sha.slice(0, 12) + ' ms=' + (Date.now() - t0));
  return { table, kind: (made.ad_table[0] || {}).name, file: a.file, sha256: sha, window: win ? { id: win.ad_window_id, name: win.name } : null, columns: user.map(c => c.name), lists: lists.map(l => ({ column: l.col, values: l.items.map(i => i.value) })), opSummary: sum(res), ops: res.length };
}
// ── the dictionary, read as rows ──
function kindRef(O, kind) {   // any AD table: its key and its number column (DocumentNo, else Name, else Value: the window's Find)
  const t = O.rows("SELECT ad_table_id, name, tablename FROM ad_table WHERE isactive='Y' AND (lower(name)=lower(?) OR lower(tablename)=lower(?)) ORDER BY ad_table_id", [kind, kind])[0];
  if (!t) refuse('unknown kind "' + kind + '"' );
  const cols = O.rows("SELECT columnname, iskey FROM ad_column WHERE ad_table_id=? AND isactive='Y'", [t.ad_table_id]);
  const has = (c) => cols.some(x => x.columnname.toLowerCase() === c);
  const key = cols.filter(x => x.iskey === 'Y')[0];
  if (!key) refuse('kind ' + t.name + ' has no key column in the dictionary');
  const numCol = ['documentno', 'name', 'value'].filter(has)[0] || null;
  return { id: t.ad_table_id, name: t.name, table: t.tablename.toLowerCase(), key: key.columnname.toLowerCase(), numCol, has };
}
function docKind(O, kind) {   // a document = an AD table with a DocAction column
  const K = kindRef(O, kind);
  if (!K.has('docaction')) refuse('kind ' + K.name + ' is not a document (its table has no DocAction column)');
  return K;
}
// THE resolver (NEURO §R.V.1): "the record a line means". Every verb that takes --id or --number comes through here; find lists the same rows.
function byNumber(O, K, number, and) {
  if (!K.numCol) refuse('kind ' + K.name + ' has no DocumentNo, Name or Value column to find by; name the record with --id');
  return O.rows('SELECT * FROM ' + K.table + ' WHERE ' + K.numCol + '=?' + (and || '') + ' ORDER BY ' + K.key, [String(number)]);
}
function recordOf(O, K, a, R) {   // R (a role, roleOf): the record is looked for among the role's rows only, so one outside them answers as one that does not exist
  if (a.id == null && a.number == null) refuse('a record is named by --id or --number');
  const rw = R ? R.where(false) : '', and = rw ? ' AND ' + rw : '';
  let r;
  if (a.id != null) {
    r = O.rows('SELECT * FROM ' + K.table + ' WHERE ' + K.key + '=?' + and, [/^-?\d+$/.test(String(a.id)) ? Number(a.id) : a.id])[0];
    if (r && a.number != null && K.numCol && String(r[K.numCol]) !== String(a.number)) refuse(K.key + ' ' + a.id + ' is ' + K.name + ' ' + r[K.numCol] + ', not number ' + a.number + ': the line names two different records');
  } else {
    const rs = byNumber(O, K, a.number, and);
    if (rs.length > 1 && BREAK !== 'firstmatch') refuse(rs.length + ' ' + K.name + ' records carry number ' + a.number + ' (ids ' + rs.map(x => x[K.key]).join(', ') + '); name one with --id');
    r = rs[0];
    if (r && BREAK === 'neighbour') r = O.rows('SELECT * FROM ' + K.table + ' WHERE ' + K.key + '<? ORDER BY ' + K.key + ' DESC LIMIT 1', [r[K.key]])[0] || O.rows('SELECT * FROM ' + K.table + ' WHERE ' + K.key + '>? ORDER BY ' + K.key + ' LIMIT 1', [r[K.key]])[0] || r;   // falsifier: the number resolves to a neighbouring record (the one before; the newest record has none after it, which made the first form of this falsifier blind to N1/N2)
  }
  if (!r) refuse('no ' + K.name + ' with ' + (a.id != null ? K.key + ' ' + a.id : 'number ' + a.number));
  return r;
}
const brief = (K, r) => ({ kind: K.name, id: r[K.key], number: K.numCol ? r[K.numCol] : null, docStatus: r.docstatus, docAction: r.docaction == null ? null : r.docaction, doctypeId: r.c_doctype_id == null ? null : r.c_doctype_id, doctypeTargetId: r.c_doctypetarget_id == null ? null : r.c_doctypetarget_id, org: r.ad_org_id });

// ── find ──
function find(O, a) {
  if (!a.kind) refuse('--kind is required');
  const K = docKind(O, a.kind);
  if (a.number == null) refuse('--number is required');
  const rs = byNumber(O, K, a.number);
  say('find kind=' + K.name + ' by=' + K.numCol + ' number=' + a.number + ' matches=' + rs.length);
  if (!rs.length) refuse('no ' + K.name + ' with ' + K.numCol + ' ' + a.number);
  return { kind: K.name, by: K.numCol, matches: rs.map(r => brief(K, r)) };
}
// ── actions ──
function actionsOf(O, K, r, a) {
  const DA = require(path.join(ROOT, 'erp', 'doc_actions.js'));
  const roleId = (BREAK === 'norole' || a.role == null) ? null : Number(a.role);
  if (a.role != null && !O.rows('SELECT 1 AS x FROM ad_role WHERE ad_role_id=?', [Number(a.role)]).length) refuse('unknown role ' + a.role);
  const res = DA.legal(O.b3, K.id, r, { roleId, clientId: r.ad_client_id });
  return res;
}
function actions(O, a) {
  if (!a.kind) refuse('--kind is required');
  const K = docKind(O, a.kind), r = recordOf(O, K, a), res = actionsOf(O, K, r, a);
  if (!res.walked) refuse(res.why);
  say('actions kind=' + K.name + ' id=' + r[K.key] + ' status=' + res.status + ' legal=[' + res.legal + '] offered=[' + res.offered + ']' + (res.role != null ? ' role=' + res.role + ' doctype=' + res.accessDoctypeId : ''));
  const out = { document: brief(K, r), docStatus: res.status, actions: res.offered, legal: res.legal, period: res.period };
  if (res.role != null) out.role = { id: res.role, doctypeId: res.accessDoctypeId, removed: res.legal.filter(x => res.offered.indexOf(x) < 0) };
  if (BREAK === 'actor' && process.env.ERP_ACTOR === 'ai') out.actions = out.actions.slice().reverse();   // the falsifier: an adapter that answers differently per actor
  return out;
}
// ── persisting an engine group: ids allocated, __opRef resolved, so a logged op is self-contained (replayed by object_cli's applyOp) ──
function resolveOne(O, op, ids, i, cols) {
  const colsOf = (t) => cols[t] || (cols[t] = O.rows('PRAGMA table_info(' + t + ')').map(c => c.name.toLowerCase()));
  const o = JSON.parse(JSON.stringify(op, (k, v) => v instanceof Uint8Array ? undefined : v)), t = o.table, idc = o.idCol || t + '_id', phys = colsOf(t).indexOf(idc) >= 0;
  const ref = (v) => (v && typeof v === 'object' && v.__opRef !== undefined) ? ids[v.__opRef] : v;
  if (o.op_type === 'CRUD_CREATE') {
    Object.keys(o.fields).forEach(k => { o.fields[k] = ref(o.fields[k]); });
    if (phys) { if (o.fields[idc] == null) { const m = O.rows('SELECT max(' + idc + ') AS m FROM ' + t)[0]; o.fields[idc] = Math.max(1, Number(m && m.m || 0) + 1); } ids[i] = o.fields[idc]; o.idCol = idc; }
    else { o.idCol = colsOf(t).filter(c => /_uu$/.test(c) && o.fields[c] != null)[0] || Object.keys(o.fields)[0]; ids[i] = o.fields[o.idCol]; o.keyless = true; }
    // the host's stamp on a new row (bim-compiler prompts/CLI_ERP_IVR.md §20): PO.setStandardDefaults (PO.java L1973-2001) and the UU (L3545-3556). The model layer leaves them to the host commit
    // (model_layer.js L389); the page's host does it at its fold (crud_core.js L452-470); this is the door's. Written INTO the op, so a replay reads these values and never makes new ones.
    if (process.env.STAMP_BREAK !== 'off') {
      const tc = colsOf(t), f = o.fields, empty = (c) => tc.indexOf(c) >= 0 && (f[c] == null || f[c] === ''), now = O.stampNow || (O.stampNow = stamp()), who = O.actor == null ? 101 : O.actor;
      if (empty('created')) f.created = now; if (empty('updated')) f.updated = now;
      if (empty('createdby')) f.createdby = who; if (empty('updatedby')) f.updatedby = who;
      if (empty(t + '_uu')) f[t + '_uu'] = require('crypto').randomUUID();
    }   // a table with no single _ID key (composite or UU key): created whole, never addressed by an update here
  } else if (o.op_type === 'CRUD_UPDATE' || o.op_type === 'CRUD_DELETE') {
    o.id = ref(o.id);
    if (o.changes) Object.keys(o.changes).forEach(k => { if (o.changes[k]) o.changes[k].new = ref(o.changes[k].new); });   // a changed column may point at a row created earlier in the same group
    if (!phys) throw new Error('an ' + o.op_type + ' on ' + t + ' cannot be addressed: the table has no ' + idc + ' column (composite or UU key); not guessed');
  }
  return o;
}
function persistGroup(O, ops) {   // each op is resolved against the rows the earlier ones already wrote (ids are allocated as the host would, one after another)
  const res = [], ids = [], cols = {};
  O.db.run('SAVEPOINT erp_group');   // all-or-none, like the engine's own group: a failing op leaves neither the memory db nor the op-log changed
  let at = null;
  try { ops.forEach((op, i) => { at = op; const o = resolveOne(O, op, ids, i, cols); OC.applyOp(O.db, O.rows, o); res.push(o); }); O.db.run('RELEASE erp_group'); }
  catch (e) { if (at) e = new Error(String(e && e.message || e) + ' [op ' + at.op_type + ' on ' + at.table + ']'); O.db.run('ROLLBACK TO erp_group'); O.db.run('RELEASE erp_group'); throw e; }
  fs.mkdirSync(path.dirname(O.opfile), { recursive: true });
  res.forEach(o => { o.t = o.t || new Date().toISOString(); fs.appendFileSync(O.opfile, JSON.stringify(o) + '\n'); O.ops.push(o); });
  return res;
}
// ── complete | void | close | reverse: ONE function; the subcommand only picks the DocumentEngine action code (DocumentEngine.java ACTION_Complete CO, ACTION_Void VO, ACTION_Close CL, ACTION_Reverse_Correct RC) ──
const ACT = { complete: 'CO', void: 'VO', close: 'CL', reverse: 'RC' };
const sum = (ops) => { const m = {}; ops.forEach(o => { const k = o.op_type.replace('CRUD_', '').toLowerCase() + ':' + o.table; m[k] = (m[k] || 0) + 1; }); return m; };
function relatedDocs(O, K, id) {   // other document tables whose rows point at this one by its key column (from the dictionary)
  return O.rows("SELECT t.tablename AS tn, t.name AS nm FROM ad_table t WHERE t.isactive='Y' AND t.isview<>'Y' AND lower(t.tablename)<>? " +
    "AND EXISTS (SELECT 1 FROM ad_column c WHERE c.ad_table_id=t.ad_table_id AND lower(c.columnname)='docaction') " +
    "AND EXISTS (SELECT 1 FROM ad_column c WHERE c.ad_table_id=t.ad_table_id AND lower(c.columnname)=?) ORDER BY t.ad_table_id", [K.table, K.key]).map(t => {
    let rs = []; try { rs = O.rows('SELECT * FROM ' + t.tn + ' WHERE ' + K.key + '=?', [id]); } catch (e) { rs = []; }
    return rs.length ? { kind: t.nm, table: t.tn.toLowerCase(), rows: rs.map(r => { const k2 = O.rows("SELECT columnname FROM ad_column c JOIN ad_table x ON x.ad_table_id=c.ad_table_id WHERE lower(x.tablename)=? AND c.iskey='Y'", [t.tn.toLowerCase()])[0]; return { id: k2 ? r[k2.columnname.toLowerCase()] : null, docStatus: r.docstatus }; }) } : null;
  }).filter(Boolean);
}
function factsOf(O, K, id) {
  if (!O.rows("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND lower(name)='fact_acct'").length) return null;
  return O.rows('SELECT c_acctschema_id AS s, account_id AS acct, amtacctdr AS dr, amtacctcr AS cr FROM fact_acct WHERE ad_table_id=? AND record_id=? ORDER BY fact_acct_id', [K.id, id]);
}
function act(O, a, code) {
  if (BREAK === 'wrongcode' && (code === 'CL' || code === 'RC')) code = 'VO';
  if (!a.kind) refuse('--kind is required');
  const aname = (O.rows('SELECT name FROM ad_ref_list WHERE ad_reference_id=135 AND value=?', [code])[0] || { name: code }).name;
  const K = docKind(O, a.kind), r = recordOf(O, K, a), id = r[K.key], before = r.docstatus;
  if (a.role != null && BREAK !== 'norole') {   // the UI never offers what the role's Document Action Access withholds (WDocActionPanel.java:185-205); the twin refuses it at the same place
    const res = actionsOf(O, K, r, a);
    if (!res.walked) refuse(res.why);
    if (res.offered.indexOf(code) < 0) refuse(aname + ' is not offered to role ' + a.role + ' for this ' + K.name + ' (status ' + res.status + '; offered: ' + (res.offered.join(', ') || 'nothing') + ')');
  }
  const ML = O.ML, env = { db: O.dbId, client: r.ad_client_id, org: r.ad_org_id, date: today() + ' 00:00:00', now: stamp(), uuid: () => require('crypto').randomUUID() };
  const log = console.log; console.log = () => {};
  let run; try { run = ML.run((s, p) => O.rows(s, p), env, { table: K.table, timing: 'DOCACTION', id, action: code }); } finally { console.log = log; }
  const lines = (run.log || []).filter(l => /§MODEL/.test(l)).map(l => String(l).slice(0, 160));
  say('act=' + code + ' kind=' + K.name + ' id=' + id + ' ' + before + ' -> ' + (run.status || '?') + ' ok=' + run.ok + (run.msg ? ' msg=' + JSON.stringify(String(run.msg).slice(0, 120)) : '') + ' ops=' + (run.ops || []).length);
  if (!run.ok) refuse(aname + ' was not done: ' + (run.msg || ('status ' + run.status)) + ' (DocStatus stays ' + before + ')');
  const ops = persistGroup(O, run.ops), after = O.rows('SELECT * FROM ' + K.table + ' WHERE ' + K.key + '=?', [id])[0], rel = relatedDocs(O, K, id), facts = factsOf(O, K, id);
  say('act-done ' + code + ' id=' + id + ' docStatus=' + after.docstatus + ' related=' + rel.map(x => x.kind + ':' + x.rows.length).join(',') + ' facts=' + (facts == null ? 'no-fact-table' : facts.length));
  return { document: brief(K, after), before: { docStatus: before }, after: { docStatus: after.docstatus, docAction: after.docaction, processed: after.processed, grandTotal: after.grandtotal == null ? null : after.grandtotal }, ops: ops.map(o => ({ op_type: o.op_type, table: o.table, id: o.op_type === 'CRUD_CREATE' ? (o.fields && o.fields[o.idCol]) : o.id })), opSummary: sum(ops), related: rel, facts: facts == null ? 'no-fact-table' : facts, engine: lines, actions: actionsOf(O, K, after, {}).offered };
}

const complete = (O, a) => act(O, a, ACT.complete);
// the generic object layer over ERP tables = object_cli's own describe/read run over the ERP's booted handle (no per-table code; the same AD rows)
function describe(O, a) { if (!a.kind) refuse('--kind is required'); return OC.describe(O, { kind: a.kind, uu: a.id, role: a.role }); }
function read(O, a) {   // by --id: unchanged. By --number: the resolver names the record, then the same read by its key
  if (!a.kind) refuse('--kind is required');
  if (a.number == null) { if (a.id == null) refuse('a record is named by --id or --number'); return OC.read(O, { kind: a.kind, uu: a.id, role: a.role }); }
  const K = kindRef(O, a.kind), r = recordOf(O, K, a, roleOf(O, K, a));
  say('read-by-number kind=' + K.name + ' by=' + K.numCol + ' number=' + a.number + ' -> ' + K.key + '=' + r[K.key]);
  return OC.read(O, { kind: a.kind, uu: String(r[K.key]), role: a.role });
}
// ── the role on a write (bim-compiler prompts/CLI_ERP_IVR.md §17 rules 1, 6, 7). The rules are erp/ad_access.js (the MRole port), reached through object_cli's roleFor; null = no --role = nothing judged.
function roleOf(O, K, a) {
  if (a.role == null) return null;
  const t = OC.kindOf(O.rows, K.table), cols = OC.columnsOf(O.rows, t), R = OC.roleFor(O, t, cols, a);
  R.K = K; R.colOf = (n) => cols.filter(c => c.columnname.toLowerCase() === String(n).toLowerCase())[0];
  return R;
}
const who = (R) => 'role ' + R.info.id + ' (' + R.info.name + ')';
function roleMayWrite(R, K, what) {   // GridWindowVO.create L277-278: a read-only window grant makes every tab read-only
  if (R && !R.window.readWrite) refuse(K.name + ' is not ' + what + ': ' + who(R) + ' opens the window ' + R.window.name + ' read-only (AD_Window_Access.IsReadWrite=N); nothing was written');
}
function roleMayUpdate(R, K, client, org, id, what) {   // MRole.canUpdate L2335-2392 (user level, client, organisation, table); with a record id also isRecordAccess(rw), as GridField.isEditable L522 asks for an edit (GridTable.dataSave L1622 and dataDelete L2199 pass Record_ID 0)
  if (!R) return;
  const cu = R.rc.canUpdate(Number(client), Number(org), K.id, R.level);
  if (!cu.allowed) refuse(K.name + ' is not ' + what + ': ' + who(R) + ' may not update a record of client ' + client + ', organisation ' + org + ' (MRole.canUpdate: ' + cu.reason + '); nothing was written');
  if (id != null && !R.rc.isRecordAccess(K.id, Number(id), false)) refuse(K.name + ' is not ' + what + ': ' + who(R) + ' holds this record read-only (AD_Record_Access); nothing was written');
}
function roleMayWriteColumn(R, K, name) {   // GridField.isEditable L525: isColumnAccess(table, column, ro=false)
  if (!R) return; const c = R.colOf(name); if (!c) return;
  if (!R.canRead(c)) refuse(who(R) + ' may not read ' + c.columnname + ' of ' + K.name + ' (AD_Column_Access); nothing was written');
  if (!R.canWrite(c)) refuse(c.columnname + ' cannot be edited here: ' + who(R) + ' holds it read-only (AD_Column_Access); nothing was written');
}

// ── new (NEURO §R.V item 2): a record created the way the window creates it. GridTab.dataNew defaults + the callout fan (ad_callout.js, the same engine the window runs), the user's columns set one
//    by one as edits (so the callouts fire as they do on screen), mandatory columns checked, then the model layer's own save (Document No from the sequence). No per-table code. ──
const DEC_ID = /^-?\d+$/, NEW_BREAK = process.env.NEW_BREAK || '';   // W-ERP-NEW falsifiers: nocallouts | nomandatory
function tabFor(O, K, R) {   // the table's own tab: the lowest tab level in its window (the window the user would open); under a role, the first such tab in a window the role is granted
  if (R && R.K === K) return { id: R.tab, win: R.window.id };
  const t = OC.tabsOf(O.rows, K.id)[0];   // the one picker (CLI_ERP_IVR §18)
  if (!t) refuse('kind ' + K.name + ' has no tab in the dictionary, so there is no window to create it in');
  return t;
}
function identOf(O, table) {   // the columns a person types to name a record of this table: DocumentNo, else Value, else Name (the lookup's identifier columns)
  const cols = O.rows("SELECT lower(c.columnname) AS c FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=? AND c.isactive='Y'", [table.toLowerCase()]).map(r => r.c);
  return ['documentno', 'value', 'name'].filter(x => cols.indexOf(x) >= 0);
}
function lookupByName(O, field, text, client) {   // a column that holds a record's id may be given as that record's number or name: resolved as the lookup does; none or several is refused naming them
  const vo = field.vo, table = vo.refTable, key = vo.refKey; if (!table || !key) refuse(vo.ColumnName + ' takes a number, "' + text + '" is not one');
  const idc = identOf(O, table); if (!idc.length) refuse(vo.ColumnName + ' takes the key of a ' + table + ' record; "' + text + '" is not a number');
  const scoped = O.rows("SELECT 1 AS x FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=? AND lower(c.columnname)='ad_client_id' AND c.isactive='Y'", [table.toLowerCase()]).length > 0;   // a lookup shows the session client's records and the system's (AD_Client_ID 0)
  const rs = O.rows('SELECT ' + key + ' AS k, ' + idc.map(c => c).join(', ') + ' FROM ' + table + ' WHERE (' + idc.map(c => 'lower(' + c + ')=lower(?)').join(' OR ') + ')' + (scoped ? ' AND ad_client_id IN (0, ' + Number(client) + ')' : ''), idc.map(() => String(text)));
  if (!rs.length) refuse('no ' + table + ' record is named "' + text + '" (looked in ' + idc.join(', ') + ')');
  if (rs.length > 1) refuse(rs.length + ' ' + table + ' records are named "' + text + '" (' + key + ' ' + rs.map(r => r.k).join(', ') + '); give the key');
  return rs[0].k;
}
// A List field holds only what its lookup holds (bim-compiler prompts/CLI_ERP_IVR.md §19): the window's dropdown is that lookup (MLookup.containsKeyNoDirect L300-311, ported ONCE as ad_callout RUNTIME.lookupContains);
// the door has no dropdown, so it asks the same function before a value is set. The refusal is PO.set_Value's own text (PO.java L1096).
function listValueCheck(O, A, st, f, v) {
  if (MIS_BREAK === 'nolistcheck' || v === '' || v == null || f.getDisplayType() !== 17 || f.vo.AD_Reference_Value_ID == null) return;
  if (A.RUNTIME.lookupContains(st, f, v)) return;
  const valid = O.rows("SELECT value FROM ad_ref_list WHERE ad_reference_id=? AND isactive='Y' ORDER BY value", [f.vo.AD_Reference_Value_ID]).map(r => r.value);
  refuse(f.vo.ColumnName + ' Invalid value - ' + v + ' - Reference_ID=' + f.vo.AD_Reference_Value_ID + valid.map(x => ' - ' + x).join('') + '; nothing was written');
}
function parseGiven(a) {   // the column=value pairs of a line (--where, repeated): shared by new and update
  const given = {}; (Array.isArray(a.where) ? a.where : (a.where ? [a.where] : [])).forEach(w => { const m = /^([A-Za-z_]\w*)=([\s\S]*)$/.exec(w); if (!m) refuse('a column is column=value, got "' + w + '"'); if (m[1].toLowerCase() in given) refuse('column ' + m[1] + ' given twice'); given[m[1].toLowerCase()] = m[2]; });
  return given;
}
function createRecord(O, a) {
  if (!a.kind) refuse('--kind is required');
  const t0 = Date.now(), K = kindRef(O, a.kind), R = roleOf(O, K, a), tab = tabFor(O, K, R), A = require(path.join(ROOT, 'erp', 'ad_callout.js'));
  const given = parseGiven(a);
  roleMayWrite(R, K, 'created'); Object.keys(given).forEach(k => roleMayWriteColumn(R, K, k));
  const log = console.log; console.log = () => {};   // the engine prints its own § lines to stdout; stdout here carries only the answer
  try {
    A.bind((sql, p) => O.rows(sql, p));
    const day = (a.date || today()), client = 11, org = Number(given.ad_org_id || 11), holder = {};
    const ctx = A.sessionContext({ client, org, role: Number(a.role || 102), user: Number(a.user || 101), wh: 103, date: day, session: holder });
    const W = 1; let parent = null;
    const field0 = A.openTab(tab.id, { ctx, windowNo: W, tabNo: 0 });   // the target tab, to know its columns before choosing parents
    const link = field0.fields.filter(f => f.vo.IsParent).map(f => f.vo.ColumnName);
    // the parent record (a line names its document): given as the column (C_Order_ID=...) or as the kind's short name (order=...), by key or by number/name
    let parentRow = null, parentTab = null;
    for (const lc of link) {
      const bare = lc.replace(/_ID$/i, '').toLowerCase(), alias = bare.replace(/^[a-z]{1,2}_/, ''), key = Object.keys(given).filter(k => k === lc.toLowerCase() || k === bare || k === alias)[0];   // a parent link column may be said in full (c_xxx_id), without _id, or without its module prefix
      const pk = key ? kindRef(O, lc.replace(/_ID$/i, '')) : null; if (!key) continue;
      const asId = key === lc.toLowerCase();   // c_xxx_id=<key> names the key; xxx=<number> names the document number
      const pr = asId ? O.rows('SELECT * FROM ' + pk.table + ' WHERE ' + pk.key + '=?', [Number(given[key])])[0] : (byNumber(O, pk, given[key]).length === 1 ? byNumber(O, pk, given[key])[0] : null);
      if (!pr) { const n = asId ? 0 : byNumber(O, pk, given[key]).length; refuse(n > 1 ? n + ' ' + pk.name + ' records carry number ' + given[key] + '; give the key' : 'no ' + pk.name + ' ' + given[key]); }
      given[lc.toLowerCase()] = String(pr[pk.key]); if (key !== lc.toLowerCase()) delete given[key];
      const ptab = tabFor(O, pk); parentRow = pr; parentTab = A.openTab(ptab.id, { ctx, windowNo: W, tabNo: 0 });
      if (parentTab) { parentTab.load(pr, false); parentTab.updateWindowContext = false; parent = parentTab; }
    }
    const st = A.openTab(tab.id, { ctx, windowNo: W, tabNo: parent ? 1 : 0, parentTab: parent });
    const bycol = {}; st.fields.forEach(f => { bycol[f.vo.ColumnName.toLowerCase()] = f; });
    const unknown = Object.keys(given).filter(k => !bycol[k]);
    if (unknown.length) refuse('kind ' + K.name + ' has no property "' + unknown[0] + '" (its properties: ' + st.fields.map(f => f.vo.ColumnName).join(', ') + ')');
    // a window that opens as Sales or Purchase takes IsSOTrx from the menu; "Order" alone does not say which
    const dry = String(a.dry || '').toUpperCase() === 'Y', needs = [];   // dry=Y (CLI_ERP_IVR §15): everything but the save; what the engine cannot fill is REPORTED instead of refused
    const iso = bycol.issotrx; if (iso && /@IsSOTrx@/i.test(iso.vo.DefaultValue || '') && !('issotrx' in given)) { if (!dry) refuse('kind ' + K.name + ' is a Sales or a Purchase document: say issotrx=Y or issotrx=N'); needs.push({ name: 'IsSOTrx', why: 'Sales (Y) or Purchase (N): the menu entry decides in the window' }); given.issotrx = 'Y'; }
    if ('issotrx' in given) A.Env.setContext(ctx, W, 'IsSOTrx', given.issotrx);
    st.load({}, true); if (NEW_BREAK !== 'nocallouts') st.dataNewCallouts();
    const set = [];
    Object.keys(given).forEach(k => {   // each given column is an edit, in the order given: its callouts fire as on screen
      const f = bycol[k]; let v = given[k];
      if (f.vo.refTable && !DEC_ID.test(String(v).trim())) v = lookupByName(O, f, v, client);
      listValueCheck(O, A, st, f, v);
      if (NEW_BREAK === 'nocallouts') f.setValue(A.typed(f.getDisplayType(), v), true); else st.setValue(f.vo.ColumnName, v);   // the break: an edit that fires no callout
      set.push(f.vo.ColumnName);
    });
    const snap = st.snapshot(), empty = st.fields.filter(f => f.isMandatory() && !f.isKey() && (snap[f.vo.ColumnName] == null || snap[f.vo.ColumnName] === '') && !/^(Created|Updated|CreatedBy|UpdatedBy)$/.test(f.vo.ColumnName)).map(f => f.vo.ColumnName);
    if (empty.length && NEW_BREAK !== 'nomandatory' && !dry) refuse('mandatory and still empty after the defaults and callouts: ' + empty.join(', ') + ' (give them as column=value)');
    const row = {}; st.fields.forEach(f => { const c = f.vo.ColumnName, v = snap[c]; if (f.isKey() || v == null || v === '') return; row[c.toLowerCase()] = (A.DisplayType.isNumeric(f.getDisplayType()) && !A.DisplayType.isID(f.getDisplayType()) && DEC_ID.test(String(v).replace('.', '')) ) ? Number(v) : v; });
    if (dry) { console.log = log; say('new DRY kind=' + K.name + ' given=' + set.join(',') + ' mandatory_empty=' + empty.join(',') + ' needs=' + needs.map(n => n.name).join(',') + ' defaulted=' + (Object.keys(row).length - set.length) + ' ms=' + (Date.now() - t0));
      return { dry: true, kind: K.name, table: K.table, mandatory: empty.filter(c => !needs.some(n => n.name.toLowerCase() === c.toLowerCase())), needs, given: set.filter(c => !(c.toLowerCase() === 'issotrx' && needs.length)), defaulted: Object.keys(row).length - set.length, filled: Object.keys(row).filter(c => set.map(x => x.toLowerCase()).indexOf(c) < 0), ops: [] }; }
    roleMayUpdate(R, K, row.ad_client_id == null ? client : row.ad_client_id, row.ad_org_id == null ? org : row.ad_org_id, null, 'created');   // GridTable.dataSave: canUpdate on the row's own client and organisation
    const tx = O.trx(); Object.assign(tx.env, { client, org, date: day + ' 00:00:00' });
    const r = O.ML.save(tx, K.table, null, row); if (!r.ok) refuse('the model layer refused the save: ' + r.error);
    const res = persistGroup(O, tx.groupOps()), main = res.filter(o => o.table === K.table)[0] || res[res.length - 1], id = main.fields ? main.fields[K.key] : main.id;
    const saved = O.rows('SELECT * FROM ' + K.table + ' WHERE ' + K.key + '=?', [id])[0] || {};
    console.log = log; say('new kind=' + K.name + ' tab=' + tab.id + ' given=' + set.join(',') + ' fields=' + Object.keys(row).length + ' id=' + id + ' number=' + (K.numCol ? saved[K.numCol] : '') + ' ms=' + (Date.now() - t0));
    return { number: K.numCol ? saved[K.numCol] : null, kind: K.name, table: K.table, id, docStatus: saved.docstatus == null ? null : saved.docstatus, given: set, defaulted: Object.keys(row).length - set.length, filled: Object.keys(row).filter(c => set.map(x => x.toLowerCase()).indexOf(c) < 0), record: saved, ops: res.map(o => ({ op_type: o.op_type, table: o.table })), ...(R ? { role: R.info } : {}) };
  } finally { console.log = log; }
}
// ── mis.update / mis.delete (bim-compiler prompts/CLI_ERP_IVR.md §12): the WINDOW's edit and delete, never a raw UPDATE/DELETE ──
const MIS_BREAK = process.env.MIS_BREAK || '';   // W-MIS-CRUD falsifiers: nocallouts | noeditcheck | noprocessed
// GridField.isEditable (iDempiere GridField.java:443-585), in its order, for a SAVED record: tab or field read-only; always-updateable; not IsUpdateable; the tab's link column; ReadOnlyLogic;
// a Processed/Processing record; an inactive record (IsActive itself stays editable). Returns the reason a person would be refused, or null.
function notEditable(O, tabId, f, rec) {
  const c = f.vo, col = c.ColumnName, EV = require(path.join(ROOT, 'erp', 'ad_evaluator.js'));
  const q = O.rows('SELECT t.isreadonly AS tro, fl.isreadonly AS fro, cl.isupdateable AS cu, fl.isupdateable AS fu FROM ad_tab t LEFT JOIN ad_column cl ON cl.ad_column_id=? LEFT JOIN ad_field fl ON fl.ad_tab_id=t.ad_tab_id AND fl.ad_column_id=cl.ad_column_id WHERE t.ad_tab_id=?', [c.AD_Column_ID, tabId])[0] || {};
  if (q.tro === 'Y') return 'the tab is read-only (GridField.isEditable L455)';
  if (q.fro === 'Y') return 'the field is read-only (GridField.isEditable L455)';
  if (c.IsAlwaysUpdateable) return null;
  if (q.cu === 'N' || q.fu === 'N') return 'the column is not updateable on a saved record (IsUpdateable=N, GridField.isEditable L494)';
  if (c.IsParent) return 'it is the tab\'s link column (GridField.isEditable L501)';
  if (c.ReadOnlyLogic) { let ro = false; try { ro = EV.evaluate(c.ReadOnlyLogic, rec, rec) === true; } catch (e) { ro = false; } if (ro) return 'its ReadOnlyLogic is true for this record (' + c.ReadOnlyLogic + ', GridField.isEditable L545)'; }
  if (rec.processed === 'Y' || rec.processing === 'Y') return 'the record is Processed (GridField.isEditable L572)';
  if (col !== 'IsActive' && rec.isactive === 'N') return 'the record is not Active (GridField.isEditable L580)';
  return null;
}
function updateRecord(O, a) {
  if (!a.kind) refuse('--kind is required');
  const t0 = Date.now(), K = kindRef(O, a.kind), R = roleOf(O, K, a), r = recordOf(O, K, a, R), tab = tabFor(O, K, R), A = require(path.join(ROOT, 'erp', 'ad_callout.js')), given = parseGiven(a);
  if (!Object.keys(given).length) refuse('nothing to change: give column=value');
  roleMayWrite(R, K, 'changed'); roleMayUpdate(R, K, r.ad_client_id == null ? 0 : r.ad_client_id, r.ad_org_id == null ? 0 : r.ad_org_id, r[K.key], 'changed'); Object.keys(given).forEach(k => roleMayWriteColumn(R, K, k));
  const log = console.log; console.log = () => {};
  try {
    A.bind((sql, p) => O.rows(sql, p));
    const day = today(), client = r.ad_client_id == null ? 11 : r.ad_client_id, org = r.ad_org_id == null ? 11 : r.ad_org_id, holder = {};
    const ctx = A.sessionContext({ client, org, role: Number(a.role || 102), user: Number(a.user || 101), wh: 103, date: day, session: holder });
    const W = 1, probe = A.openTab(tab.id, { ctx, windowNo: W, tabNo: 0 });
    let parent = null;   // a line's callouts read its document: the parent record, by the tab's own link column
    probe.fields.filter(f => f.vo.IsParent).forEach(f => {
      const lc = f.vo.ColumnName; if (r[lc.toLowerCase()] == null) return;
      const pk = kindRef(O, lc.replace(/_ID$/i, '')), pr = O.rows('SELECT * FROM ' + pk.table + ' WHERE ' + pk.key + '=?', [r[lc.toLowerCase()]])[0]; if (!pr) return;
      const pt = A.openTab(tabFor(O, pk).id, { ctx, windowNo: W, tabNo: 0 }); if (pt) { pt.load(pr, false); pt.updateWindowContext = false; parent = pt; }
    });
    const st = A.openTab(tab.id, { ctx, windowNo: W, tabNo: parent ? 1 : 0, parentTab: parent }), bycol = {}; st.fields.forEach(f => { bycol[f.vo.ColumnName.toLowerCase()] = f; });
    const unknown = Object.keys(given).filter(k => !bycol[k]);
    if (unknown.length) refuse('kind ' + K.name + ' has no property "' + unknown[0] + '" (its properties: ' + st.fields.map(f => f.vo.ColumnName).join(', ') + ')');
    st.load(r, false); const before = st.snapshot(), set = [];
    Object.keys(given).forEach(k => {
      const f = bycol[k]; let v = given[k] === '<null>' ? '' : given[k];   // <null> clears a column (a door line cannot carry an empty value)
      const why = MIS_BREAK === 'noeditcheck' ? null : notEditable(O, tab.id, f, r); if (why) refuse(f.vo.ColumnName + ' cannot be edited here: ' + why + '; nothing was written');
      if (v !== '' && f.vo.refTable && !DEC_ID.test(String(v).trim())) v = lookupByName(O, f, v, client);
      listValueCheck(O, A, st, f, v);
      if (MIS_BREAK === 'nocallouts') f.setValue(A.typed(f.getDisplayType(), v), false); else st.setValue(f.vo.ColumnName, v);   // an edit: its callouts fire as on screen (the break: none)
      set.push(f.vo.ColumnName);
    });
    const after = st.snapshot(), changes = {}, num = (f, v) => (A.DisplayType.isNumeric(f.getDisplayType()) && !A.DisplayType.isID(f.getDisplayType()) && DEC_ID.test(String(v).replace('.', ''))) ? Number(v) : v;
    st.fields.forEach(f => { const c = f.vo.ColumnName; if (f.isKey() || String(after[c]) === String(before[c])) return; changes[c.toLowerCase()] = after[c] === '' ? null : num(f, after[c]); });
    const empty = st.fields.filter(f => f.isMandatory() && !f.isKey() && (after[f.vo.ColumnName] == null || after[f.vo.ColumnName] === '') && Object.prototype.hasOwnProperty.call(changes, f.vo.ColumnName.toLowerCase())).map(f => f.vo.ColumnName);
    if (empty.length) refuse('mandatory and left empty: ' + empty.join(', ') + '; nothing was written');
    const tx = O.trx(); Object.assign(tx.env, { client, org, date: day + ' 00:00:00', now: stamp(), user: Number(a.user || 101) });
    const live = tx.get(K.table, r[K.key]), sv = O.ML.save(tx, K.table, live, changes); if (!sv.ok) refuse('the model layer refused the save: ' + sv.error + '; nothing was written');
    const res = persistGroup(O, tx.groupOps()), saved = O.rows('SELECT * FROM ' + K.table + ' WHERE ' + K.key + '=?', [r[K.key]])[0] || {};
    console.log = log; const changed = Object.keys(changes), derived = changed.filter(c => set.map(x => x.toLowerCase()).indexOf(c) < 0);
    say('update kind=' + K.name + ' id=' + r[K.key] + ' given=' + set.join(',') + ' changed=' + changed.join(',') + ' derived=' + derived.join(',') + (res.length ? '' : ' NO-OP') + ' ms=' + (Date.now() - t0));
    return { number: K.numCol ? saved[K.numCol] : null, kind: K.name, table: K.table, id: r[K.key], noop: res.length === 0, given: set, changed, derived, record: saved, ops: res.map(o => ({ op_type: o.op_type, table: o.table })) };
  } finally { console.log = log; }
}
function deleteRecord(O, a) {
  if (!a.kind) refuse('--kind is required');
  const t0 = Date.now(), K = kindRef(O, a.kind), R = roleOf(O, K, a), r = recordOf(O, K, a, R), tab = tabFor(O, K, R), id = r[K.key];
  roleMayWrite(R, K, 'deleted'); roleMayUpdate(R, K, r.ad_client_id == null ? 0 : r.ad_client_id, r.ad_org_id == null ? 0 : r.ad_org_id, null, 'deleted');   // GridTable.dataDelete L2199: canUpdate(client, org, table, 0): the role cannot update that client/org -> AccessCannotDelete (Record_ID 0: no record-access question, as legacy)
  const tq = O.rows('SELECT t.isreadonly AS tro, x.isdeleteable AS del FROM ad_tab t JOIN ad_table x ON x.ad_table_id=t.ad_table_id WHERE t.ad_tab_id=?', [tab.id])[0] || {};
  if (tq.tro === 'Y') refuse(K.name + ' is not deleted: the tab is read-only (GridTable.dataDelete L2170: AccessCannotDelete)');
  if (tq.del === 'N') refuse(K.name + ' is not deleted: the table is not deleteable (GridTable.dataDelete L2177: AccessNotDeleteable)');
  const env = { db: O.dbId, client: r.ad_client_id, org: r.ad_org_id, date: today() + ' 00:00:00', now: stamp(), uuid: () => require('crypto').randomUUID() };
  const log = console.log; console.log = () => {};
  let run; try { run = O.ML.run((s, p) => O.rows(s, p), env, { table: K.table, timing: 'DELETE', id, force: MIS_BREAK === 'noprocessed' }); } finally { console.log = log; }
  say('delete kind=' + K.name + ' id=' + id + ' ok=' + run.ok + (run.error || run.msg ? ' why=' + JSON.stringify(String(run.error || run.msg).slice(0, 120)) : '') + ' ops=' + (run.ops || []).length);
  if (!run.ok) refuse(K.name + ' ' + (K.numCol ? r[K.numCol] : id) + ' is not deleted: ' + (run.error || run.msg) + '; nothing was written');
  const res = persistGroup(O, run.ops);
  return { deleted: { kind: K.name, table: K.table, id, number: K.numCol ? r[K.numCol] : null }, gone: O.rows('SELECT 1 AS x FROM ' + K.table + ' WHERE ' + K.key + '=?', [id]).length === 0, ops: res.map(o => ({ op_type: o.op_type, table: o.table, id: o.id })), opSummary: sum(res), ms: Date.now() - t0 };
}
// ── mis.load (bim-compiler prompts/CLI_ERP_IVR.md §13): a CSV of one kind through the Migrate Excel Data process (ERP's own loader, class org.idempiere.ninja.process.MigrateExcelData, run as it is) ──
// The CSV is read by the same SheetJS the host ships (raw: true, so 007 stays 007); one CSV = one sheet named after the kind's table. The loader is ALL OR NOTHING (its F7), so
// the preview names every bad row and writes <file>.rejected.csv / <file>.ok.csv, and a commit with any bad row is refused. Updates are not offered (the loader's update mode is a raw UPDATE
// with no model events: use mis.update, which runs the window's save).
const LOAD_BREAK = process.env.LOAD_BREAK || '';   // W-MIS-LOAD falsifiers: dryrunwrites | skiprejects
async function loadRecords(O, a) {
  if (!a.kind) refuse('--kind is required');
  if (!a.file) refuse('--file is required (a .csv)');
  if (!/\.csv$/i.test(String(a.file))) refuse('the file must be a .csv: ' + a.file);
  if (a.role != null) refuse('mis.load does not judge a role yet: the loader is a process, and its access is the process grant (AD_Process_Access), which is not wired here; run it without role. Nothing was loaded');
  const K = kindRef(O, a.kind), dry = String(a.dry == null ? 'Y' : a.dry).toUpperCase() !== 'N', t0 = Date.now();
  let text; try { text = fs.readFileSync(a.file, 'utf8'); } catch (e) { refuse('cannot read ' + a.file + ': ' + (e.code || e.message)); }
  const XL = require(path.join(ROOT, 'erp', 'xlsx.mini.min.js')), wb0 = XL.read(text, { type: 'string', raw: true });
  const grid = XL.utils.sheet_to_json(wb0.Sheets[wb0.SheetNames[0]], { header: 1, raw: true, defval: '' }).map(r => r.map(c => String(c)));
  if (grid.length < 2) refuse('the file has no rows: ' + a.file + ' (a header line and at least one data line)');
  const url = require('url'), chunk = await import(url.pathToFileURL(path.join(ROOT, 'erp', 'plugins', 'ninja_migrate_process.mjs')).href), AP = require(path.join(ROOT, 'erp', 'ad_process.js'));
  if (!AP.JAVA || !AP.JAVA[chunk.CLASSNAME]) chunk.activate({ process: AP });
  const book = [{ name: K.table, rows: grid }], file = 'mis_load_' + process.pid + '.xlsx';
  chunk.putFile(file, chunk.bookToWorkbook(book));
  const log = console.log; console.log = () => {};
  const tx = O.trx(); Object.assign(tx.env, { client: 11, org: 11, user: 101, date: today() + ' 00:00:00', now: stamp() });
  let r; try { r = AP.runJava((s2, p2) => O.rows(s2, p2), tx.env, { trx: tx, AD_Process_ID: 9540001, className: chunk.CLASSNAME, title: 'Migrate Excel Data', params: { File_Directory: file, Processed: 'N' } }); }
  catch (e) { r = { ok: false, summary: 'threw: ' + e.message, log: tx.log }; } finally { console.log = log; chunk.dropFile(file); }
  const errs = (tx.log || []).filter(l => /^§NINJA-ERR/.test(l)).map(l => String(l).replace(/^§NINJA-ERR\s*/, '')), bad = {};
  errs.forEach(e => { const m = /row (\d+)\b/.exec(e), n = m ? Number(m[1]) - 1 : 0; (bad[n] = bad[n] || []).push(e.replace(/^.*?row \d+:?\s*/, '')); });   // the loader counts sheet rows (the header is row 1): n = the data row
  const rows = grid.length - 1, badRows = Object.keys(bad).map(Number).filter(n => n > 0), unplaced = bad[0] || [], ok = rows - badRows.length;
  const base = String(a.file).replace(/\.csv$/i, ''), csv = (rs) => XL.utils.sheet_to_csv(XL.utils.aoa_to_sheet(rs), { FS: ',', RS: '\n' }) + '\n';   // a row number is the data row (1 = the first line after the header)
  const outFiles = {};
  if (dry && badRows.length && LOAD_BREAK !== 'skiprejects') {
    fs.writeFileSync(base + '.rejected.csv', csv([grid[0].concat(['rejected_because'])].concat(badRows.sort((x, y) => x - y).map(n => grid[n].concat([bad[n].join(' | ')]))))); outFiles.rejected = base + '.rejected.csv';
    fs.writeFileSync(base + '.ok.csv', csv([grid[0]].concat(grid.slice(1).filter((_, i) => badRows.indexOf(i + 1) < 0)))); outFiles.ok = base + '.ok.csv';
  }
  if (!(r && r.ok) && !badRows.length && !unplaced.length) refuse('the loader stopped: ' + String(r && r.summary || 'no answer') + '; nothing was loaded');   // e.g. a header that is not a column of the table
  say('load kind=' + K.name + ' rows=' + rows + ' rejected=' + badRows.length + ' unplaced=' + unplaced.length + ' dry=' + dry + ' loader_ok=' + !!(r && r.ok) + ' ms=' + (Date.now() - t0));
  const out = { kind: K.name, table: K.table, file: a.file, rows, ok, rejected: badRows.sort((x, y) => x - y).map(n => ({ row: n, why: bad[n] })), unplaced, dry, loaded: false, files: outFiles, summary: r && r.summary };
  if (dry) { if (LOAD_BREAK === 'dryrunwrites' && r && r.ok) { persistGroup(O, tx.groupOps()); out.loaded = true; } return out; }
  if (!r || !r.ok) refuse('nothing was loaded: ' + (badRows.length ? badRows.length + ' of ' + rows + ' rows are rejected (the loader is all or nothing); run with dry=Y for the list and ' + path.basename(base) + '.ok.csv' : String(r && r.summary)));
  const res = persistGroup(O, tx.groupOps()); out.loaded = true; out.ops = res.length; out.opSummary = sum(res); out.keys = res.filter(o => o.table === K.table && o.op_type === 'CRUD_CREATE').map(o => (o.fields || {})[K.key] != null ? o.fields[K.key] : o.id);
  return out;
}
async function main(argv) {
  const cmd = argv[0], a = {};
  for (let i = 1; i < argv.length; i++) { const m = /^--(\w+)$/.exec(argv[i]); if (!m || i + 1 >= argv.length) { say('FAIL usage: ' + argv[i]); return 2; } if (m[1] === 'where') (a.where = a.where || []).push(argv[++i]); else a[m[1]] = argv[++i]; }
  if (['find', 'actions', 'describe', 'read', 'list', 'sum', 'group', 'new', 'update', 'delete', 'load', 'add_window'].concat(Object.keys(ACT)).indexOf(cmd) < 0) { say('FAIL usage: erp_cli.js find|actions|complete|void|close|reverse|describe|read|list|sum|group --kind K (--number N | --id I) [--role R]'); return 2; }
  try {
    const O = await boot(a); O.actor = a.user == null ? 101 : Number(a.user);   // the session user: stated, default 101 (the same default the callout context takes), until sign-in exists
    const out = await (ACT[cmd] ? act(O, a, ACT[cmd]) : ({ find, actions, describe, read, list: OC.list, sum: OC.sum, group: OC.group, new: createRecord, update: updateRecord, delete: deleteRecord, load: loadRecords, add_window: addWindow })[cmd](O, a));
    process.stdout.write(JSON.stringify(out) + '\n'); return 0;
  } catch (e) {
    if (e instanceof Refused || e instanceof OC.Refused) { say('REFUSED ' + e.message); process.stdout.write(JSON.stringify({ refused: true, reason: e.message }) + '\n'); return 3; }
    say('FAIL ' + (e && e.message !== undefined ? e.message : String(e))); if (process.env.ERP_DEBUG) console.error(e.stack); return 1;
  }
}
if (require.main === module) main(process.argv.slice(2)).then(c => process.exit(c));
module.exports = { addWindow, ensureTables, tabFor, main, boot, loadRecords, find, actions, complete, act, ACT, describe, read, persistGroup, resolveOne, docKind, kindRef, byNumber, recordOf, loadEngine, b3 };
