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
//     read     --kind K --id I            one record by its key, with its single-row child tabs (object_cli's read)
//     complete|void|close|reverse --kind K --id I [--role R]   DocAction CO|VO|CL|RC (DocumentEngine constants) through ModelLayer.run (DocumentEngine.processIt) = the twin of legacy's action; --role refuses what that role is not offered
//   Writes never touch the .db: each op is appended to the op-log (JSONL; --oplog, else $BIM_OBJECT_OPLOG, else ~/.cache/bim_object/<db>.ops.jsonl, the object layer's own log) and replayed on every run.
//   The .db is the shipped erp/ad_seed.db (--db to name another); it is opened into memory, never written.
// Exit: 0 ok · 3 refused (an answer: not found, not offered, the engine said no) · 1 error · 2 usage.
// Run: node common/door/erp_cli.js find --kind "Order" --number 50000
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const OC = require('./object_cli.js');
const say = (s) => process.stderr.write('§ERP ' + s + '\n');
const BREAK = process.env.ERP_BREAK || '';   // witness falsifiers: 'actor' (the answer depends on who asks) · 'norole' (the role filter is skipped) · 'wrongcode' (close runs the void action)
class Refused extends Error {}
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
    let udf = 0; A.RUNTIME.registerSqlFunctions((nm, f) => { O.db.create_function(nm, f); udf++; });   // the page does the same (idempiere.html :1175); sql.js takes the arity from f.length
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
async function boot(a) {
  const O = await OC.open({ db: a.db || path.join(ROOT, 'erp', 'ad_seed.db') });
  // the page's self-heal patch comes BEFORE the op-log replay (an op may write a table only the patch creates, e.g. m_storagereservationlog); same loop as idempiere.html :1160-1169:
  //   statements one by one, a failing one never blocks (the bundled wasm cannot take the file in one run)
  const t0 = Date.now(); let pOk = 0, pFail = 0;
  [path.basename(O.file) + '.sql', 'mfg.sql'].forEach(f => { const pf = path.join(path.dirname(O.file), 'patches', f); if (!fs.existsSync(pf)) return;
    fs.readFileSync(pf, 'utf8').split(/;\s*\n/).forEach(st => { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { O.db.run(st); pOk++; } catch (e) { pFail++; } }); });
  say('patch statements=' + pOk + ' failed=' + pFail + ' ms=' + (Date.now() - t0));
  O.opfile = OC.oplogFile({ oplog: a.oplog }, O.file); O.ops = OC.readOps(O.opfile);
  O.ops.forEach(o => OC.applyOp(O.db, O.rows, o));
  O.ML = require(path.join(ROOT, 'erp', 'model_layer.js')); O.dbId = 'model:' + path.basename(O.file);
  O.trx = () => new O.ML.Trx((sql, p) => O.rows(sql, p), { db: O.dbId, now: new Date().toISOString().replace('T', ' ').slice(0, 19), uuid: () => require('crypto').randomUUID() });
  loadEngine(O); O.b3 = b3(O);
  say('boot db=' + path.basename(O.file) + ' replayed_ops=' + O.ops.length + ' oplog=' + O.opfile + ' sql_functions=' + O.udf);
  return O;
}

// ── the dictionary, read as rows ──
function docKind(O, kind) {
  const t = O.rows("SELECT ad_table_id, name, tablename FROM ad_table WHERE isactive='Y' AND (lower(name)=lower(?) OR lower(tablename)=lower(?)) ORDER BY ad_table_id", [kind, kind])[0];
  if (!t) refuse('unknown kind "' + kind + '"' );
  const cols = O.rows("SELECT columnname, iskey FROM ad_column WHERE ad_table_id=? AND isactive='Y'", [t.ad_table_id]);
  const has = (c) => cols.some(x => x.columnname.toLowerCase() === c);
  if (!has('docaction')) refuse('kind ' + t.name + ' is not a document (its table has no DocAction column)');
  const key = cols.filter(x => x.iskey === 'Y')[0];
  if (!key) refuse('kind ' + t.name + ' has no key column in the dictionary');
  const numCol = ['documentno', 'name', 'value'].filter(has)[0] || null;
  return { id: t.ad_table_id, name: t.name, table: t.tablename.toLowerCase(), key: key.columnname.toLowerCase(), numCol, has };
}
function recordOf(O, K, a) {
  if (a.id == null && a.number == null) refuse('a document is named by --id or --number');
  let r;
  if (a.id != null) r = O.rows('SELECT * FROM ' + K.table + ' WHERE ' + K.key + '=?', [Number(a.id)])[0];
  else { const rs = O.rows('SELECT * FROM ' + K.table + ' WHERE ' + K.numCol + '=?', [a.number]); if (rs.length > 1) refuse(rs.length + ' ' + K.name + ' documents carry number ' + a.number + ' (ids ' + rs.map(x => x[K.key]).join(', ') + '); name one with --id'); r = rs[0]; }
  if (!r) refuse('no ' + K.name + ' with ' + (a.id != null ? K.key + ' ' + a.id : 'number ' + a.number));
  return r;
}
const brief = (K, r) => ({ kind: K.name, id: r[K.key], number: K.numCol ? r[K.numCol] : null, docStatus: r.docstatus, docAction: r.docaction == null ? null : r.docaction, doctypeId: r.c_doctype_id == null ? null : r.c_doctype_id, doctypeTargetId: r.c_doctypetarget_id == null ? null : r.c_doctypetarget_id, org: r.ad_org_id });

// ── find ──
function find(O, a) {
  if (!a.kind) refuse('--kind is required');
  const K = docKind(O, a.kind);
  if (a.number == null) refuse('--number is required');
  if (!K.numCol) refuse('kind ' + K.name + ' has no DocumentNo, Name or Value column to find by');
  const rs = O.rows('SELECT * FROM ' + K.table + ' WHERE ' + K.numCol + '=? ORDER BY ' + K.key, [String(a.number)]);
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
    else { o.idCol = colsOf(t).filter(c => /_uu$/.test(c) && o.fields[c] != null)[0] || Object.keys(o.fields)[0]; ids[i] = o.fields[o.idCol]; o.keyless = true; }   // a table with no single _ID key (composite or UU key): created whole, never addressed by an update here
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
  if (BREAK === 'wrongcode' && code === 'CL') code = 'VO';
  if (!a.kind) refuse('--kind is required');
  const aname = (O.rows('SELECT name FROM ad_ref_list WHERE ad_reference_id=135 AND value=?', [code])[0] || { name: code }).name;
  const K = docKind(O, a.kind), r = recordOf(O, K, a), id = r[K.key], before = r.docstatus;
  if (a.role != null && BREAK !== 'norole') {   // the UI never offers what the role's Document Action Access withholds (WDocActionPanel.java:185-205); the twin refuses it at the same place
    const res = actionsOf(O, K, r, a);
    if (!res.walked) refuse(res.why);
    if (res.offered.indexOf(code) < 0) refuse(aname + ' is not offered to role ' + a.role + ' for this ' + K.name + ' (status ' + res.status + '; offered: ' + (res.offered.join(', ') || 'nothing') + ')');
  }
  const ML = O.ML, env = { db: O.dbId, client: r.ad_client_id, org: r.ad_org_id, date: String(new Date().toISOString()).slice(0, 10) + ' 00:00:00', now: new Date().toISOString().replace('T', ' ').slice(0, 19), uuid: () => require('crypto').randomUUID() };
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
function describe(O, a) { if (!a.kind) refuse('--kind is required'); return OC.describe(O, { kind: a.kind, uu: a.id }); }
function read(O, a) { if (!a.kind) refuse('--kind is required'); if (a.id == null) refuse('--id is required'); return OC.read(O, { kind: a.kind, uu: a.id }); }

async function main(argv) {
  const cmd = argv[0], a = {};
  for (let i = 1; i < argv.length; i++) { const m = /^--(\w+)$/.exec(argv[i]); if (!m || i + 1 >= argv.length) { say('FAIL usage: ' + argv[i]); return 2; } a[m[1]] = argv[++i]; }
  if (['find', 'actions', 'describe', 'read'].concat(Object.keys(ACT)).indexOf(cmd) < 0) { say('FAIL usage: erp_cli.js find|actions|complete|void|close|reverse|describe|read --kind K (--number N | --id I) [--role R]'); return 2; }
  try {
    const O = await boot(a), out = ACT[cmd] ? act(O, a, ACT[cmd]) : ({ find, actions, describe, read })[cmd](O, a);
    process.stdout.write(JSON.stringify(out) + '\n'); return 0;
  } catch (e) {
    if (e instanceof Refused || e instanceof OC.Refused) { say('REFUSED ' + e.message); process.stdout.write(JSON.stringify({ refused: true, reason: e.message }) + '\n'); return 3; }
    say('FAIL ' + (e && e.message !== undefined ? e.message : String(e))); if (process.env.ERP_DEBUG) console.error(e.stack); return 1;
  }
}
if (require.main === module) main(process.argv.slice(2)).then(c => process.exit(c));
module.exports = { main, boot, find, actions, complete, act, ACT, describe, read, persistGroup, resolveOne, docKind, recordOf, loadEngine, b3 };
