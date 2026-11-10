#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — the OBJECT LAYER's command line, rung 1 (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §0.8; W-OBJ-*). Read the §OBJECT lines after every run; an exit code is not evidence.
// WHAT IT IS: the Kernel ERP's object engine (erp/model_layer.js Trx, erp/ad_attachment.js, erp/crud_core.js changeLog) run over a MODEL'S OWN sql.js handle, with the model's own dictionary
//   (the AD_* rows its patch carries, buildings/patches/<db>.sql §OBJ_DICT). Five generic commands, the same for every registered kind; NO table of the model is named here (AD-LAYER LAW):
//     describe --kind K [--uu U]          reflection: properties, child tabs, legal generic methods. Reads ONLY dictionary rows.
//     read     --kind K --uu U            the record and its single-row child tabs
//     update   --kind K --uu U --column C --value V    one column, checked against the dictionary, written as a CRUD_UPDATE op
//     attach   --kind K --uu U --file F | --name N --text T     an attachment on the record (Record_UU = its UU), through ad_attachment.js
//     history  --kind K --uu U            the legacy change-log rows the op-log implies (crud_core.js changeLog)
//     count    --kind K [--where column=value]...   how many records of the kind (after the op-log), each filter column checked against the dictionary (§0.13). An empty kind is VACUOUS, never a plain 0.
//   Writes never touch the .db: each op is appended to an op-log (JSONL; --oplog, else $BIM_OBJECT_OPLOG, else ~/.cache/bim_object/<db>.ops.jsonl) and replayed into memory on every run.
// Exit: 0 ok · 3 refused (a shape check or a missing record: an answer) · 1 error (unknown kind, no dictionary) · 2 usage.
// Run: node common/door/object_cli.js describe --building Duplex --kind Element
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..');
const say = (s) => process.stderr.write('§OBJECT ' + s + '\n');
class Refused extends Error {}
const refuse = (m) => { throw new Refused(m); };
const NAME = /^[A-Za-z0-9_-]{1,64}$/;
// ad_attachment.js builds and reads its zip with the browser's CompressionStream('deflate-raw'); Node before 20.x lacks that format. Same bytes from zlib, only where the host lacks it.
(function shim() {
  let ok = true; try { new CompressionStream('deflate-raw'); new DecompressionStream('deflate-raw'); } catch (e) { ok = false; }
  if (ok) return;
  const zlib = require('zlib'), mk = (fn) => class extends TransformStream { constructor() { const parts = []; super({ transform(c) { parts.push(Buffer.from(c)); }, flush(ctl) { ctl.enqueue(new Uint8Array(fn(Buffer.concat(parts)))); } }); } };
  globalThis.CompressionStream = mk(zlib.deflateRawSync); globalThis.DecompressionStream = mk(zlib.inflateRawSync);
})();

function resolveDb(a) {
  if (a.db) { if (!fs.existsSync(a.db)) throw new Error('no such file: ' + a.db); return a.db; }
  const b = a.building;
  if (typeof b !== 'string' || !NAME.test(b)) throw new Error('building must be a name such as "Duplex" (letters, digits, _ and - only)');
  const dirs = [process.env.VIEWER_BLD_DIR, path.join(ROOT, 'buildings'), path.join(os.homedir(), 'bim-ootb', 'buildings')].filter(Boolean);
  for (const d of dirs) for (const f of [b + '_extracted.db', b + '.db']) { const p = path.join(d, f); if (fs.existsSync(p) && fs.statSync(p).size > 100000) return p; }
  throw new Error('unknown building "' + b + '": no ' + b + '_extracted.db in ' + dirs.join(', '));
}
// the Viewer's own statement chunker (viewer/scene.js A._runSqlChunked), taken from its source so there is ONE implementation of "apply a patch"
function loadChunker() {
  const src = fs.readFileSync(path.join(ROOT, 'viewer', 'scene.js'), 'utf8'), a = src.indexOf('A._runSqlChunked = function(db, sql) {'), b = src.indexOf('\n  };', a);
  if (a < 0 || b < 0) throw new Error('viewer/scene.js has no A._runSqlChunked');
  const A = {}; new Function('A', src.slice(a, b + 5))(A); return A._runSqlChunked;
}
const lit = (v) => "'" + String(v).replace(/'/g, "''") + "'";
const REF = { 10: 'string', 14: 'text', 11: 'integer', 22: 'number', 12: 'amount', 29: 'quantity', 17: 'list', 20: 'yesno', 15: 'date', 16: 'datetime', 13: 'id', 19: 'tabledirect', 18: 'table', 30: 'search' };

async function open(a) {
  const file = resolveDb(a), SQL = await require(path.join(ROOT, 'common', 'lib', 'sql-wasm.js'))({ wasmBinary: fs.readFileSync(path.join(ROOT, 'common', 'lib', 'sql-wasm.wasm')) });
  const db = new SQL.Database(fs.readFileSync(file)), rows = (sql, p) => { const st = db.prepare(sql), o = []; try { if (p && p.length) { try { st.bind(p); } catch (e) { throw new Error(String(e && e.message || e) + ' in ' + sql.slice(0, 90) + ' params=' + JSON.stringify(p)); } } while (st.step()) { const r = st.getAsObject(), l = {}; for (const k in r) l[k.toLowerCase()] = r[k]; o.push(l); } } finally { st.free(); } return o; };
  const has = () => rows("SELECT name FROM sqlite_master WHERE type='table' AND lower(name)='ad_table'").length > 0;
  let patch = 'present';
  if (!has()) {
    // this checkout's patch is the canonical one (the loader's convention is a patches/ folder beside the db; a db found in another checkout may sit beside a stale patch)
    const pf = [path.join(ROOT, 'buildings', 'patches'), path.join(path.dirname(file), 'patches')].map(d => path.join(d, path.basename(file) + '.sql')).filter(f => fs.existsSync(f))[0] || path.join(path.dirname(file), 'patches', path.basename(file) + '.sql');
    if (!fs.existsSync(pf)) throw new Error('this model carries no dictionary (no ad_table) and has no patch at ' + pf);
    loadChunker()(db, fs.readFileSync(pf, 'utf8')); patch = 'applied';
    if (!has()) throw new Error('the patch ' + pf + ' did not add a dictionary');
  }
  say('open db=' + path.basename(file) + ' dictionary=' + patch);
  return { db, rows, file, SQL };
}
// ── the dictionary, read as rows ──
function kindOf(rows, kind) {
  const t = rows('SELECT ad_table_id, name, tablename, ishighvolume, ischangelog, ad_window_id, ad_table_uu FROM ad_table WHERE isactive=\'Y\' AND (lower(name)=lower(?) OR lower(tablename)=lower(?))', [kind, kind])[0];
  if (!t) { const known = rows("SELECT name FROM ad_table WHERE isactive='Y' AND ad_table_uu IS NOT NULL ORDER BY ad_table_id").map(r => r.name); throw new Error('unknown kind "' + kind + '" (this model registers: ' + known.join(', ') + ')'); }
  return t;
}
function columnsOf(rows, t) {
  return rows('SELECT c.ad_column_id, c.columnname, c.name, c.ad_reference_id, c.ad_reference_value_id, c.fieldlength, c.iskey, c.isparent, c.ismandatory, c.isupdateable, c.valuemin, c.valuemax, c.isallowlogging FROM ad_column c WHERE c.ad_table_id=? AND c.isactive=\'Y\' ORDER BY c.ad_column_id', [t.ad_table_id]);
}
function childTabs(rows, t) {
  // the tabs one level below the tab that shows this table, in the same window (GridWindow tab levels); the link is the child's IsParent column
  const mine = rows('SELECT tb.ad_tab_id, tb.ad_window_id, tb.tablevel, tb.seqno FROM ad_tab tb WHERE tb.ad_table_id=? AND tb.isactive=\'Y\' ORDER BY tb.tablevel, tb.seqno', [t.ad_table_id])[0];
  if (!mine) return [];
  return rows('SELECT tb.name, tb.issinglerow, tb.isreadonly, tb.tablevel, tb.seqno, t2.name AS kind, t2.tablename, t2.ad_table_id FROM ad_tab tb JOIN ad_table t2 ON t2.ad_table_id=tb.ad_table_id WHERE tb.ad_window_id=? AND tb.isactive=\'Y\' AND tb.tablevel=? AND tb.seqno>? ORDER BY tb.seqno', [mine.ad_window_id, mine.tablevel + 1, mine.seqno])
    .map(c => ({ kind: c.kind, table: c.tablename, tab: c.name, single: c.issinglerow === 'Y', readonly: c.isreadonly === 'Y', link: (rows('SELECT columnname FROM ad_column WHERE ad_table_id=? AND isparent=\'Y\' AND isactive=\'Y\'', [c.ad_table_id])[0] || {}).columnname || null }));
}
function listValues(rows, refId) { return rows("SELECT value, name FROM ad_ref_list WHERE ad_reference_id=? AND isactive='Y' ORDER BY value", [refId]); }

function describe(O, a) {
  const t = kindOf(O.rows, a.kind), cols = columnsOf(O.rows, t), tabs = childTabs(O.rows, t);
  const props = cols.map(c => {
    const p = { name: c.columnname, label: c.name, type: REF[c.ad_reference_id] || 'ref:' + c.ad_reference_id, mandatory: c.ismandatory === 'Y', updateable: c.isupdateable === 'Y', key: c.iskey === 'Y', parent: c.isparent === 'Y', length: c.fieldlength };
    if (c.valuemin != null) p.min = c.valuemin; if (c.valuemax != null) p.max = c.valuemax;
    if (c.ad_reference_id === 17 && c.ad_reference_value_id != null) p.values = listValues(O.rows, c.ad_reference_value_id).map(v => v.value);
    return p;
  });
  const key = cols.filter(c => c.iskey === 'Y')[0], AT = require('../../erp/ad_attachment.js');
  const tab = { tableName: t.tablename, tableId: t.ad_table_id, fields: cols.map(c => ({ columnName: c.columnname, isKey: c.iskey === 'Y' })) };
  const methods = ['read'];
  if (key && cols.some(c => c.isupdateable === 'Y' && c.iskey !== 'Y')) methods.push('update');
  if (AT.canHave(tab)) methods.push('attach');
  if (t.ischangelog === 'Y') methods.push('history');
  const out = { kind: t.name, table: t.tablename, uu: t.ad_table_uu, key: key ? key.columnname : null, highVolume: t.ishighvolume === 'Y', properties: props, childTabs: tabs, methods };
  if (a.uu) out.record = { uu: a.uu, childWhere: tabs.map(c => c.table + '.' + c.link + ' = ' + lit(a.uu)) };   // the link, read from the dictionary; no data row is read
  say('describe kind=' + t.name + ' properties=' + props.length + ' childTabs=' + tabs.length + ' methods=' + methods.join(',') + ' source=dictionary-rows-only');
  return out;
}

// ── op-log: append-only JSONL; replayed into memory ──
function oplogFile(a, file) { return a.oplog || process.env.BIM_OBJECT_OPLOG || path.join(os.homedir(), '.cache', 'bim_object', path.basename(file) + '.ops.jsonl'); }
function readOps(f) { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (e) { return []; } }
function applyOp(db, rows, op) {   // the generic fold: a CRUD op onto a table. No table is named; the key column is the op's own idCol, else <table>_id.
  const t = op.table, idc = op.idCol || t + '_id';
  if (op.op_type === 'CRUD_CREATE') {
    const f = Object.assign({}, op.fields), r = rows('SELECT max(' + idc + ') AS m FROM ' + t)[0];
    if (f[idc] == null) f[idc] = Math.max(1, Number(r && r.m || 0) + 1);
    const ks = Object.keys(f); db.run('INSERT INTO ' + t + ' (' + ks.join(',') + ') VALUES (' + ks.map(() => '?').join(',') + ')', ks.map(k => f[k] instanceof Uint8Array ? f[k] : f[k]));
  } else if (op.op_type === 'CRUD_UPDATE') {
    const ks = Object.keys(op.changes); if (ks.length) db.run('UPDATE ' + t + ' SET ' + ks.map(k => k + '=?').join(',') + ' WHERE ' + idc + '=?', ks.map(k => op.changes[k].new).concat([op.id]));
  } else if (op.op_type === 'CRUD_DELETE') db.run('DELETE FROM ' + t + ' WHERE ' + idc + '=?', [op.id]);
}
function sideDbOf(O, ops) {   // the op-log as the ERP's kernel_ops table, for crud_core.changeLog
  const s = new O.SQL.Database(); s.run('CREATE TABLE kernel_ops (id INTEGER PRIMARY KEY, op_type TEXT, parameters TEXT, timestamp TEXT, undone INTEGER DEFAULT 0)');
  ops.forEach((o, i) => s.run('INSERT INTO kernel_ops (id, op_type, parameters, timestamp) VALUES (?,?,?,?)', [i + 1, o.op_type, JSON.stringify(o), o.t || '']));
  return s;
}
async function boot(a) {
  const O = await open(a);
  O.opfile = oplogFile(a, O.file); O.ops = readOps(O.opfile);
  O.ops.forEach(o => applyOp(O.db, O.rows, o));
  const ML = require('../../erp/model_layer.js');
  O.ML = ML; O.dbId = 'model:' + path.basename(O.file);
  O.trx = () => new ML.Trx((sql, p) => O.rows(sql, p), { db: O.dbId, now: new Date().toISOString().replace('T', ' ').slice(0, 19), uuid: () => require('crypto').randomUUID() });
  say('replay ops=' + O.ops.length + ' oplog=' + O.opfile);
  return O;
}
function persist(O, ops) {
  fs.mkdirSync(path.dirname(O.opfile), { recursive: true });
  ops.forEach(o => { o.t = o.t || new Date().toISOString(); fs.appendFileSync(O.opfile, JSON.stringify(o, (k, v) => v instanceof Uint8Array ? undefined : v) + '\n'); applyOp(O.db, O.rows, o); O.ops.push(o); });
}
function record(O, a) {
  if (!a.uu) refuse('a record needs --uu');
  const t = kindOf(O.rows, a.kind), cols = columnsOf(O.rows, t), key = cols.filter(c => c.iskey === 'Y')[0];
  if (!key) refuse('kind ' + t.name + ' has no key column in the dictionary');
  const row = O.trx().get(t.tablename, a.uu);
  if (!row) refuse('no ' + t.name + ' with ' + key.columnname + ' ' + a.uu);
  return { t, cols, key, row };
}
function read(O, a) {
  const r = record(O, a), tx = O.trx(), kids = childTabs(O.rows, r.t).map(c => ({ kind: c.kind, rows: c.link ? tx.find(c.table, { [c.link]: a.uu }) : [] }));
  say('read kind=' + r.t.name + ' uu=' + a.uu + ' key=' + r.key.columnname + ' children=' + kids.map(k => k.kind + ':' + k.rows.length).join(','));
  return { kind: r.t.name, uu: a.uu, record: r.row, children: kids };
}
// shape checks from the dictionary (type, mandatory, list, updateable). The generated validator shared with the door is §0.4 detail 3a: deferred; this is the dictionary's own rule meanwhile.
function shape(O, cols, c, value) {
  if (c.iskey === 'Y' || c.isupdateable !== 'Y') return c.columnname + ' is not updateable';
  const type = REF[c.ad_reference_id];
  if (value === '' || value == null) return c.ismandatory === 'Y' ? c.columnname + ' is mandatory' : null;
  if ((type === 'number' || type === 'integer' || type === 'amount' || type === 'quantity') && !(String(value).trim() !== '' && isFinite(Number(value)))) return c.columnname + ' must be a number';
  if (type === 'integer' && !Number.isInteger(Number(value))) return c.columnname + ' must be a whole number';
  if (type === 'list' && c.ad_reference_value_id != null && !listValues(O.rows, c.ad_reference_value_id).some(v => v.value === String(value))) return c.columnname + ' must be one of: ' + listValues(O.rows, c.ad_reference_value_id).map(v => v.value).join(', ');
  if (c.valuemin != null && Number(value) < Number(c.valuemin)) return c.columnname + ' is below the minimum ' + c.valuemin;
  if (c.valuemax != null && Number(value) > Number(c.valuemax)) return c.columnname + ' is above the maximum ' + c.valuemax;
  return null;
}
function update(O, a) {
  const r = record(O, a), c = r.cols.filter(x => x.columnname.toLowerCase() === String(a.column || '').toLowerCase())[0];
  if (!c) refuse('kind ' + r.t.name + ' has no property "' + a.column + '"');
  const bad = shape(O, r.cols, c, a.value); if (bad) refuse(bad);
  const type = REF[c.ad_reference_id], v = (type === 'number' || type === 'integer' || type === 'amount' || type === 'quantity') && a.value !== '' ? Number(a.value) : a.value;
  const oldV = r.row[c.columnname.toLowerCase()], tx = O.trx(), res = O.ML.save(tx, r.t.tablename, r.row, { [c.columnname.toLowerCase()]: v });
  if (!res.ok) refuse(res.error);
  const ops = tx.groupOps(); persist(O, ops);
  say('update kind=' + r.t.name + ' uu=' + a.uu + ' ' + c.columnname + ' ' + JSON.stringify(oldV) + ' -> ' + JSON.stringify(v) + ' ops=' + ops.length + ' keyUnchanged=' + (O.trx().get(r.t.tablename, a.uu) ? 1 : 0));
  return { kind: r.t.name, uu: a.uu, ops, record: O.trx().get(r.t.tablename, a.uu) };
}
async function attach(O, a) {
  const AT = require('../../erp/ad_attachment.js'), r = record(O, a);
  const tab = { tableName: r.t.tablename, tableId: r.t.ad_table_id, fields: r.cols.map(c => ({ columnName: c.columnname, isKey: c.iskey === 'Y' })) };
  if (!AT.canHave(tab)) refuse('kind ' + r.t.name + ' cannot have an attachment (its key is neither _ID nor _UU)');
  const cx = AT.ctxFor(tab, r.row);
  if (!cx) refuse('No Key: ' + r.t.name + ' ' + a.uu + ' has neither a numeric id nor a UU, so nothing can be attached to it');
  let entries = [];
  if (a.file) { if (!fs.existsSync(a.file)) refuse('no such file: ' + a.file); const d = fs.readFileSync(a.file); entries = [{ name: path.basename(a.file), data: new Uint8Array(d), size: d.length }]; }
  else if (!a.text) refuse('attach needs --file or --text');
  let got = [];
  const host = { rows: (sql) => O.rows(sql), commit: async (ops) => { got = got.concat(ops); return true; }, std: null };
  const row = AT.lookup(host, cx), cur = row ? await AT.load(row) : { entries: [], text: '' };
  const merged = cur.entries.slice(); entries.forEach(e => { const i = merged.findIndex(x => x.name === e.name); if (i >= 0) merged[i] = e; else merged.push(e); });
  const res = await AT.save(host, cx, row, merged, a.text || cur.text || '', {});
  if (!res.ok) refuse('the attachment was not saved' + (res.reason ? ': ' + res.reason : ''));
  persist(O, got);
  const after = AT.lookup({ rows: (sql) => O.rows(sql) }, cx);
  say('attach kind=' + r.t.name + ' uu=' + a.uu + ' record_uu=' + (cx.recordUU || '') + ' record_id=' + (cx.recordId == null ? '' : cx.recordId) + ' op=' + res.op + ' bytes=' + res.bytes + ' entries=' + merged.length);
  return { kind: r.t.name, uu: a.uu, ops: got.map(o => ({ op_type: o.op_type, table: o.table, record_uu: o.fields && o.fields.record_uu })), attachment: after ? { id: after.ad_attachment_id, record_uu: after.record_uu, title: after.title } : null, entries: merged.map(e => ({ name: e.name, size: e.size })) };
}
// §0.13 the first MEASURE: a count of a kind. The kind's table and every filter column come from the dictionary (reflection: an unknown column is an error that names it). population = the kind's
// rows with no filter; when that is 0 nothing was judged, so the verdict is VACUOUS (the door replies inconclusive), never 0-as-an-answer.
const CB = () => process.env.COUNT_BREAK || '';   // W-OBJ-COUNT falsifiers: plus1 | nofilter | zero_ok
function filtersOf(t, cols, a) {   // the shared filter reader: --where column=value, each column checked against the dictionary (reflection), a number column takes a number
  const filters = [], where = [], params = [];
  (a.where || []).forEach(w => {
    const m = /^([A-Za-z_]\w*)=([\s\S]*)$/.exec(w); if (!m) refuse('a filter is column=value, got "' + w + '"');
    const c = cols.filter(x => x.columnname.toLowerCase() === m[1].toLowerCase())[0];
    if (!c) throw new Error('kind ' + t.name + ' has no property "' + m[1] + '" (its properties: ' + cols.map(x => x.columnname).join(', ') + ')');
    if (filters.some(f => f.column === c.columnname)) refuse('filter ' + c.columnname + ' given twice');
    const type = REF[c.ad_reference_id], num = type === 'number' || type === 'integer' || type === 'amount' || type === 'quantity';
    if (num && !/^[+-]?\d+(\.\d+)?$/.test(m[2].trim())) refuse(c.columnname + ' is a number; "' + m[2] + '" is not');
    filters.push({ column: c.columnname, value: m[2] }); where.push(c.columnname + (num ? ' = CAST(? AS NUMERIC)' : ' = ?')); params.push(m[2]);
  });
  return process.env.ROWS_BREAK === 'nofilter' ? { filters, where: [], params: [] } : { filters, where, params };   // the break: the filters are named in the answer but not applied
}
function count(O, a) {
  const t = kindOf(O.rows, a.kind), cols = columnsOf(O.rows, t), { filters, where, params } = filtersOf(t, cols, a);
  const population = Number(O.rows('SELECT count(*) AS n FROM ' + t.tablename)[0].n);
  let n = filters.length && CB() !== 'nofilter' ? Number(O.rows('SELECT count(*) AS n FROM ' + t.tablename + ' WHERE ' + where.join(' AND '), params)[0].n) : population;
  if (CB() === 'plus1') n += 1;
  const verdict = population === 0 && CB() !== 'zero_ok' ? 'VACUOUS' : 'OK';
  const summary = verdict === 'VACUOUS' ? 'this model holds no ' + t.name + ' record, so nothing was counted' : n + ' ' + t.name + (filters.length ? ' where ' + filters.map(f => f.column + ' = ' + f.value).join(' and ') + ' (of ' + population + ')' : '');
  say('count kind=' + t.name + ' table=' + t.tablename + ' filters=' + JSON.stringify(filters) + ' count=' + n + ' population=' + population + ' verdict=' + verdict + (CB() ? ' COUNT_BREAK=' + CB() : ''));
  return { kind: t.name, table: t.tablename, filters, count: n, population, verdict, summary };
}
// ── §R.V item 5: rows, a sum and group counts. Every column comes from the dictionary (reflection); values are bound, never spliced into SQL. ──
const LIST_MAX = 1000, LIST_DEFAULT = 50, RB = () => process.env.ROWS_BREAK || '';   // W-DOOR-ROWS falsifiers: nofilter | floatsum | capoff
function colOf(t, cols, name, what) {
  const c = cols.filter(x => x.columnname.toLowerCase() === String(name).toLowerCase())[0];
  if (!c) throw new Error('kind ' + t.name + ' has no property "' + name + '" for ' + what + ' (its properties: ' + cols.map(x => x.columnname).join(', ') + ')');
  return c;
}
const isNum = (c) => ['number', 'integer', 'amount', 'quantity'].indexOf(REF[c.ad_reference_id]) >= 0;
function whereSql(w) { return w.where.length ? ' WHERE ' + w.where.join(' AND ') : ''; }
const popOf = (O, t) => Number(O.rows('SELECT count(*) AS n FROM ' + t.tablename)[0].n);
function list(O, a) {
  const t0 = Date.now(), t = kindOf(O.rows, a.kind), cols = columnsOf(O.rows, t), w = filtersOf(t, cols, a);
  const has = (n) => cols.filter(x => x.columnname.toLowerCase() === n)[0];
  const key = cols.filter(x => x.iskey === 'Y')[0];
  const names = a.columns ? String(a.columns).split(',').map(x => colOf(t, cols, x.trim(), 'columns').columnname)
    : [key && key.columnname].concat(['documentno', 'name', 'value', 'docstatus'].map(has).filter(Boolean).map(x => x.columnname)).filter(Boolean).filter((x, i, arr) => arr.indexOf(x) === i);
  if (!names.length) refuse('kind ' + t.name + ' has no column to show');
  let order = ''; if (a.sort) { const desc = /^-/.test(a.sort), c = colOf(t, cols, String(a.sort).replace(/^-/, ''), 'sort'); order = ' ORDER BY ' + c.columnname + (desc ? ' DESC' : ''); } else if (key) order = ' ORDER BY ' + key.columnname;
  const limit = RB() === 'capoff' ? 1000000 : a.limit == null ? LIST_DEFAULT : Number(a.limit), offset = a.offset == null ? 0 : Number(a.offset);
  if (!Number.isInteger(limit) || limit < 1 || (limit > LIST_MAX && RB() !== 'capoff')) refuse('limit must be a whole number from 1 to ' + LIST_MAX + ', got "' + a.limit + '"');
  if (!Number.isInteger(offset) || offset < 0) refuse('offset must be a whole number, 0 or more, got "' + a.offset + '"');
  const population = popOf(O, t), total = w.where.length ? Number(O.rows('SELECT count(*) AS n FROM ' + t.tablename + whereSql(w), w.params)[0].n) : population;
  const raw = O.rows('SELECT ' + names.map(n => n + ' AS "' + n + '"').join(', ') + ' FROM ' + t.tablename + whereSql(w) + order + ' LIMIT ' + limit + ' OFFSET ' + offset, w.params);
  const rows = raw.map(r => { const o = {}; names.forEach(n => { o[n] = r[n] !== undefined ? r[n] : r[n.toLowerCase()]; }); return o; });
  const verdict = population === 0 ? 'VACUOUS' : 'OK';
  say('list kind=' + t.name + ' table=' + t.tablename + ' filters=' + JSON.stringify(w.filters) + ' rows=' + rows.length + ' total=' + total + ' population=' + population + ' offset=' + offset + ' limit=' + limit + ' ms=' + (Date.now() - t0) + ' verdict=' + verdict);
  return { kind: t.name, table: t.tablename, filters: w.filters, columns: names, rows, shown: rows.length, total, population, offset, verdict, summary: verdict === 'VACUOUS' ? 'this model holds no ' + t.name + ' record, so nothing was listed' : 'shown ' + rows.length + ' of ' + total + ' ' + t.name };
}
function decSum(texts) {   // exact: BigInt coefficient over a common scale (no floating point)
  const parts = texts.map(s => { const m = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(String(s).trim()); if (!m) throw new Error('"' + s + '" is not a number the sum can add exactly'); let sc = (m[3] || '').length - (m[4] ? +m[4] : 0), big = BigInt(m[2] + (m[3] || '')); if (sc < 0) { big *= 10n ** BigInt(-sc); sc = 0; } return [m[1] === '-' ? -big : big, sc]; });
  const sc = parts.reduce((x, p) => Math.max(x, p[1]), 0), tot = parts.reduce((x, p) => x + p[0] * 10n ** BigInt(sc - p[1]), 0n), neg = tot < 0n, d = (neg ? -tot : tot).toString().padStart(sc + 1, '0');
  const out = (sc ? d.slice(0, -sc) + '.' + d.slice(-sc) : d).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return (neg && /[1-9]/.test(out) ? '-' : '') + out;
}
function sum(O, a) {
  const t0 = Date.now(), t = kindOf(O.rows, a.kind), cols = columnsOf(O.rows, t), w = filtersOf(t, cols, a);
  if (!a.column) refuse('sum needs --column');
  const c = colOf(t, cols, a.column, 'sum'); if (!isNum(c)) refuse(c.columnname + ' is not a number column (' + (REF[c.ad_reference_id] || 'reference ' + c.ad_reference_id) + '), so it cannot be summed');
  const population = popOf(O, t);
  const vals = O.rows('SELECT CAST(' + c.columnname + ' AS TEXT) AS v FROM ' + t.tablename + whereSql(w) + (w.where.length ? ' AND ' : ' WHERE ') + c.columnname + ' IS NOT NULL', w.params).map(r => r.v);
  const total = RB() === 'floatsum' ? String(vals.reduce((x, v) => x + Number(v), 0)) : decSum(vals), verdict = population === 0 ? 'VACUOUS' : 'OK';
  say('sum kind=' + t.name + ' column=' + c.columnname + ' filters=' + JSON.stringify(w.filters) + ' n=' + vals.length + ' sum=' + total + ' population=' + population + ' ms=' + (Date.now() - t0) + ' verdict=' + verdict);
  return { kind: t.name, table: t.tablename, column: c.columnname, filters: w.filters, n: vals.length, sum: total, population, verdict, summary: verdict === 'VACUOUS' ? 'this model holds no ' + t.name + ' record, so nothing was summed' : total + ' = sum of ' + c.columnname + ' over ' + vals.length + ' ' + t.name };
}
function group(O, a) {
  const t0 = Date.now(), t = kindOf(O.rows, a.kind), cols = columnsOf(O.rows, t), w = filtersOf(t, cols, a);
  if (!a.by) refuse('group needs --by');
  const c = colOf(t, cols, a.by, 'by'), population = popOf(O, t);
  const raw = O.rows('SELECT ' + c.columnname + ' AS g, count(*) AS n FROM ' + t.tablename + whereSql(w) + ' GROUP BY ' + c.columnname + ' ORDER BY n DESC, g', w.params);
  const rows = raw.map(r => ({ [c.columnname]: r.g, count: Number(r.n) })), records = rows.reduce((x, r) => x + r.count, 0), verdict = population === 0 ? 'VACUOUS' : 'OK';
  say('group kind=' + t.name + ' by=' + c.columnname + ' filters=' + JSON.stringify(w.filters) + ' groups=' + rows.length + ' records=' + records + ' population=' + population + ' ms=' + (Date.now() - t0) + ' verdict=' + verdict);
  return { kind: t.name, table: t.tablename, by: c.columnname, filters: w.filters, columns: [c.columnname, 'count'], rows, shown: rows.length, total: rows.length, records, population, verdict, summary: verdict === 'VACUOUS' ? 'this model holds no ' + t.name + ' record, so nothing was counted' : rows.length + ' groups over ' + records + ' ' + t.name };
}
function history(O, a) {
  const r = record(O, a), CC = require('../../erp/crud_core.js');
  // the record's row BEFORE the first op: today's row with every logged change reverted (the op-log keeps each change's old value)
  const baseRow = Object.assign({}, O.trx().get(r.t.tablename, a.uu));
  O.ops.slice().reverse().forEach(o => { if (o.op_type === 'CRUD_UPDATE' && o.table === r.t.tablename && String(o.id) === String(a.uu)) Object.keys(o.changes).forEach(k => { baseRow[k] = o.changes[k].old; }); });
  const log = console.log; console.log = () => {};   // changeLog prints its own § line to stdout; stdout here carries only the answer
  let rowsOut; try { rowsOut = CC.changeLog(sideDbOf(O, O.ops), r.t.tablename, a.uu, { dictDb: O.db, baseRow: baseRow, insertLog: 'N' }); } finally { console.log = log; }
  say('history kind=' + r.t.name + ' uu=' + a.uu + ' entries=' + (rowsOut ? rowsOut.length : 'null') + ' ops=' + O.ops.length);
  if (rowsOut == null) throw new Error('the change log could not be derived');
  return { kind: r.t.name, uu: a.uu, entries: rowsOut.map(e => ({ column: e.column, old: e.old, new: e.new, event: e.event, uu: e.uu, record: e.record })) };
}

async function main(argv) {
  const cmd = argv[0], a = {};
  for (let i = 1; i < argv.length; i++) { const m = /^--(\w+)$/.exec(argv[i]); if (!m || i + 1 >= argv.length) { say('FAIL usage: ' + argv[i]); return 2; } if (m[1] === 'where') (a.where = a.where || []).push(argv[++i]); else a[m[1]] = argv[++i]; }
  if (['describe', 'read', 'update', 'attach', 'history', 'count', 'list', 'sum', 'group'].indexOf(cmd) < 0) { say('FAIL usage: object_cli.js describe|read|update|attach|history|count|list|sum|group --building B --kind K [--uu U] ...'); return 2; }
  if (!a.kind) { say('FAIL usage: --kind is required'); return 2; }
  try {
    const O = await boot(a), out = cmd === 'describe' ? describe(O, a) : cmd === 'read' ? read(O, a) : cmd === 'update' ? update(O, a) : cmd === 'attach' ? await attach(O, a) : cmd === 'count' ? count(O, a) : cmd === 'list' ? list(O, a) : cmd === 'sum' ? sum(O, a) : cmd === 'group' ? group(O, a) : history(O, a);
    process.stdout.write(JSON.stringify(out) + '\n'); return 0;
  } catch (e) {
    if (e instanceof Refused) { say('REFUSED ' + e.message); process.stdout.write(JSON.stringify({ refused: true, reason: e.message }) + '\n'); return 3; }
    say('FAIL ' + (e && e.message !== undefined ? e.message : String(e))); if (process.env.OBJECT_DEBUG) console.error(e.stack); return 1;
  }
}
if (require.main === module) main(process.argv.slice(2)).then(c => process.exit(c));
module.exports = { main, describe, read, update, attach, history, count, list, sum, group, decSum, boot, open, kindOf, columnsOf, childTabs, applyOp, loadChunker, Refused, oplogFile, readOps };
