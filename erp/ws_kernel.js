// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ws_kernel.js - the headless Kernel ERP the web service writes through (bim-compiler prompts/ERP_WS_API.md S2/S3).
//   ONE write path: every create/update/delete/doc-action is the model layer's own save()/remove()/processIt() (erp/model_layer.js) inside ONE Trx whose op group is applied
//   to this kernel's DB and appended, signed-in-order, to its op journal with the caller's actor. The API adds no write logic of its own.
//   Pure of HTTP; the host (ws_server.js) owns the sockets. Same DB the page loads: ad_seed.db + patches/ad_seed.db.sql (+ tenant SQL).
'use strict';
// ONE kernel, two thin SHELLS (bim-compiler prompts/SHEET_FRONT_DOOR.md §9, W-FILE-IT): everything below the shell is the same lines in node and in a browser.
//   The shell H is the only host-specific part: need(file) = a module (the kernel's `require` below), processes() = the process ports, sha256(text) -> hex, uuid(), nowMs(),
//   perfMs(), and for the boot sqljs(), seed(), patch(), extra(files). Node shell = nodeShell() here; browser shell = ws_kernel_web.js (fetch + the page's script globals +
//   a sync SHA-256). shell(over) replaces calls (a witness fixes the clock and the ids on both sides the same way).
(function (global, nodeRequire) {
function nodeShell() {
  const fs = nodeRequire('fs'), path = nodeRequire('path'), os = nodeRequire('os'), crypto = nodeRequire('crypto');
  return {
    need: function (file) { return nodeRequire(file); },
    processes: function () { fs.readdirSync(path.join(__dirname, 'processes')).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) { try { nodeRequire('./processes/' + f); } catch (e) { /* a port needing a browser-only global stays unregistered, named by the process answer */ } }); },
    sha256: function (text) { return crypto.createHash('sha256').update(text).digest('hex'); },
    uuid: function () { return crypto.randomUUID(); }, nowMs: function () { return Date.now(); }, perfMs: function () { return nodeRequire('perf_hooks').performance.now(); },
    sqljs: function () { return nodeRequire(process.env.SQLJS || (os.homedir() + '/bim-ootb/tests/node_modules/sql.js'))(); },
    seed: function () { return fs.readFileSync(path.join(__dirname, 'ad_seed.db')); },
    patch: function () { const pf = path.join(__dirname, 'patches/ad_seed.db.sql'); return fs.existsSync(pf) ? fs.readFileSync(pf, 'utf8') : null; },
    extra: function (files) { return (files || []).map(function (f) { return fs.readFileSync(f, 'utf8'); }); }
  };
}
let H = nodeRequire ? nodeShell() : null;
function shell(over) { if (over) H = Object.assign({}, H || {}, over); return H; }
function require(file) { return H.need(file); }   // the kernel's module lookup: node's require in node, the page's script globals in a browser
function load(extraSql) {
  return Promise.resolve(H.sqljs()).then(function (SQL) { return Promise.all([H.seed(), H.patch(), H.extra(extraSql)]).then(function (io) {
    const db = new SQL.Database(io[0]);
    const run = (txt) => txt.split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { db.run(st); } catch (e) { /* the page's per-statement tolerance */ } });
    if (io[1] != null) run(io[1]);
    io[2].forEach(run);
    require('./ad_rule.js').ensure(db);   // §10.8: the AD_Rule / AD_Table_ScriptValidator physical tables (boot overlay, not in the hashed patches)
    require('./ad_import_tables.js').ensure(db);   // §13.2 B1: the I_Order physical table (boot overlay, not in the hashed patches)
    require('./ad_index_overlay.js').ensure(db);
    require('./ad_docvalue_overlay.js').ensure(db);
    require('./ad_site_task_overlay.js').ensure(db);   // W-SITE-TASK-ENSURE: Request Type "Site Task" + its Status Category (boot overlay, not in the hashed patches)
    require('./ad_taxcat_overlay.js').ensure(db);   // W-TAXCAT-OVERLAY: products without the legacy-mandatory tax category (boot overlay, not in the hashed patches)   // W-DOCVALUE-WF: document-value workflow rows (boot overlay, not in the hashed patches)   // HS3: legacy's official dictionary indexes on the physical tables (boot overlay, not in the hashed patches)
    return build(db);
  }); });
}
function build(db) {
  const A = require('./ad_callout.js');
  // A-6 / A3-CLOCK-2 (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md): this headless kernel is a SHELL, so it installs the one edge (clock + ids) its core
  //   reads; a caller that installed its own first (a witness with a fixed clock) keeps it.
  if (!A.Env.hasEdge()) A.Env.setEdge({ nowMs: () => H.nowMs(), uuid: () => H.uuid(), perfMs: () => H.perfMs() });
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require('./callouts/' + m + '.js'); });
  require('./db_export_safe.js').registerCoreUdfs(db, A);   // §EXPORTSAFE: re-bound after every db.export()
  const ML = require('./model_layer.js');
  H.processes();   // node: every port in processes/; a browser page: the ones its shell loaded
  ['model_trade', 'model_ctor', 'model_cost', 'model_match', 'model_order', 'model_invoice', 'model_post', 'model_master', 'model_bankstatement', 'model_requisition', 'model_banktransfer', 'model_depositbatch', 'model_inoutconfirm', 'model_project'].forEach(function (m) { require('./' + m + '.js'); });
  require('./model_initial_defaults.js');   // the generated setInitialDefaults table (§G1-SPEC) - the page loads it after model_layer.js too
  function q(sql, params) {
    const st = db.prepare(sql), out = [];
    try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; })); while (st.step()) { const o = st.getAsObject(), r = {}; for (const k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); }
    return out;
  }
  const one = (sql, p) => q(sql, p || [])[0] || null;
  // the page's §AD-MODELVAL-LIVE install (crud_overlay.js _installAllModelVal): every ported M*.beforeSave validator, db captured in the hook closures. Without it a web-service save skipped them all.
  const MV = require('./ad_modelval.js'), shim = { prepare: function (sql) { const flat = (a) => [].concat.apply([], [].slice.call(a)); return { all: function () { return q(sql, flat(arguments)); }, get: function () { return q(sql, flat(arguments))[0]; } }; } };
  const slots = function (fn) { Object.keys(MV.REGISTRY).forEach(function (t) { Object.keys(MV.REGISTRY[t]).forEach(function (tm) { fn(MV.REGISTRY[t][tm], t, tm); }); }); }, had = new Set(), mine = new Set();
  slots(function (a) { a.forEach(function (e) { had.add(e); }); });
  Object.keys(MV).forEach(function (m) { if (/^install[A-Z].*SaveHooks$/.test(m) && typeof MV[m] === 'function') { try { MV[m](shim); } catch (e) { console.log('§WS modelval installer ' + m + ' skipped (' + e.message + ')'); } } });
  if (typeof MV.installDefaultHooks === 'function') { try { MV.installDefaultHooks(); } catch (e) { /* none */ } }
  slots(function (a) { a.forEach(function (e) { if (!had.has(e)) mine.add(e); }); });
  // dispose(): take back exactly the validators THIS build registered (they close over this kernel's database; SHEET_FRONT_DOOR.md §9.5 finding 3). Returns the number removed.
  function dispose() { let n = 0; slots(function (a, t, tm) { for (let i = a.length - 1; i >= 0; i--) if (mine.has(a[i])) { a.splice(i, 1); n++; } if (!a.length) { delete MV.REGISTRY[t][tm]; if (!Object.keys(MV.REGISTRY[t]).length) delete MV.REGISTRY[t]; } }); mine.clear(); return n; }
  const cols = {}, nextId = {};
  const colsOf = (t) => cols[t] || (cols[t] = q('PRAGMA table_info(' + t + ')').map(function (c) { return c.name.toLowerCase(); }));
  // WS_ID_LAW=synthetic: the PAGE's id law (crud_core.listTip pk = -opId; crud_overlay._resolveOpRefs) - every row made through the op log is NEGATIVE and unique. Default = legacy-like positive ids
  //   (max, 1000001...). The page-law switch is what lets a headless witness judge the paths the live page runs (PAYSAVE-SPEC, bim-compiler prompts/MIGRATE_INSTALL_TENANT.md).
  let synSeq = 0;
  function newId(t) { if (typeof process !== 'undefined' && process.env && process.env.WS_ID_LAW === 'synthetic') return -(++synSeq); if (nextId[t] == null) { const m = one('SELECT MAX(' + t + '_id) AS m FROM ' + t); nextId[t] = Math.max(Number(m.m || 0), 1000000); } return ++nextId[t]; }
  // apply an op group the way commitGroup + the listTip fold do (CREATE gets a fresh key, {__opRef}/{{opref:n}} resolved, UPDATE/DELETE by key)
  let comp = null;   // composite transaction (CompositeServiceImpl): ops apply at once (later operations must see them) with an undo log; the journal waits for the commit
  function undoOf(o, cs, t) {
    const idc = o.idCol || t + '_id';
    if (o.op_type === 'CRUD_UPDATE' || o.op_type === 'CRUD_DELETE') { const rid = (o.id && typeof o.id === 'object' && o.id.__opRef != null) ? null : o.id; const row = rid == null ? null : one('SELECT * FROM ' + t + ' WHERE ' + idc + '=?', [rid]); if (row) comp.undo.push({ kind: o.op_type === 'CRUD_UPDATE' ? 'restore' : 'reinsert', table: t, idc: idc, id: rid, row: row }); }
  }
  const apply = applier(db, { colsOf: colsOf, newId: newId, seen: function (t, id) { nextId[t] = Math.max(nextId[t] == null ? 0 : nextId[t], Number(id)); },
    before: function (o, cs, t) { if (comp) undoOf(o, cs, t); }, created: function (t, pk, id) { if (comp) comp.undo.push({ kind: 'delete', table: t, idc: pk, id: id }); } });
  let clock = H.nowMs(), uu = 0;
  const sessionTok = new WeakMap();   // one token per (this kernel, login session): the holder of that login's context (ad_callout sessionContext = Env.getCtx())
  function env(s) {   // the session of the WS login, like Env.getCtx() for the request
    clock += 1000; const st = A.Env.stamp(clock);   // the LOCAL day + stamp (A.Env, the login context's one clock): legacy's WS session #Date is SimpleDateFormat of currentTimeMillis in the JVM's zone (CompiereService.java:281-283). Was the UTC day (#2996).
    return { client: s.clientId, org: s.orgId, user: s.userId, role: s.roleId, date: st.day + ' 00:00:00', now: st.now, nowMillis: clock, session: sessionTok.get(s) || (sessionTok.set(s, {}), sessionTok.get(s)), ctx: { m_warehouse_id: s.warehouseId },   // Env.getContextAsInt(ctx, "#M_Warehouse_ID") of the WS login (MOrder.beforeSave :1206-1215)
      uuid: function () { uu++; return H.uuid(); } };
  }
  const journal = [], hooks = { onJournal: null }, ctxMeta = { v: null };   // ctxMeta.v: extra journal meta for the call in flight (e.g. approvedBy)   // the kernel's own ordered op history: every entry names the caller's actor and chains the hash of the one before (ERP_WS_API.md S5)
  function commit(session, ops, meta) {
    const e0 = env(session), std = { now: e0.now, user: e0.user, client: e0.client, org: e0.org }, ids = apply(ops, std);
    if (comp) { comp.pend.push({ session: session, ops: ops, std: std, meta: (meta || ctxMeta.v) ? Object.assign({}, meta || {}, ctxMeta.v || {}) : null }); return ids; }
    return journalOf(session, ops, meta ? Object.assign({}, meta, ctxMeta.v || {}) : (ctxMeta.v ? Object.assign({}, ctxMeta.v) : null), ids, std);
  }
  function journalOf(session, ops, metaAll, ids, std) {
    const prev = journal.length ? journal[journal.length - 1].hash : '0'.repeat(64);
    const entry = { seq: (journal.length ? journal[journal.length - 1].seq : 0) + 1, actor: session.actor || ('user:' + session.userId), at: new Date(H.nowMs()).toISOString(), meta: metaAll, ops: ops.length, opsDigest: H.sha256(JSON.stringify(ops)), prev: prev };
    entry.hash = H.sha256(prev + JSON.stringify([entry.seq, entry.actor, entry.meta, entry.opsDigest]));
    entry.payload = { std: std, ops: ops };   // NOT in the hash chain; its digest is (opsDigest): a changed payload is detected on replay
    journal.push(entry); if (hooks.onJournal) hooks.onJournal(entry); return ids;
  }
  // replay(text): rebuild a host's data from its journal file (replayInto below, with this kernel's apply and journal). Returns { entries, replayed, skipped }.
  function replay(text) { const r = replayInto(db, text, { apply: apply, onEntry: function (e) { journal.push(e); } }); return { entries: journal.length, replayed: r.replayed, skipped: r.skipped }; }
  function compositeBegin() { comp = { undo: [], pend: [] }; }
  function compositeCommit() { if (!comp) return; const p = comp.pend; comp.undo = []; comp.pend = []; p.forEach(function (x) { journalOf(x.session, x.ops, x.meta, [], x.std); }); }   // the journal gets the group at commit, in order
  function compositeRollback() {
    if (!comp) return; const u = comp.undo; comp.undo = []; comp.pend = [];
    for (let i = u.length - 1; i >= 0; i--) {
      const x = u[i];
      if (x.kind === 'delete') db.run('DELETE FROM ' + x.table + ' WHERE ' + x.idc + '=?', [x.id]);
      else { if (x.kind === 'restore') db.run('DELETE FROM ' + x.table + ' WHERE ' + x.idc + '=?', [x.id]); const ks = Object.keys(x.row); db.run('INSERT INTO ' + x.table + ' (' + ks.map(function (k) { return '"' + k + '"'; }).join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return x.row[k] === undefined ? null : x.row[k]; })); }
    }
  }
  function compositeEnd() { comp = null; }
  // run fn(trx) in one Trx; on ok apply+journal its op group, on failure apply nothing (legacy: rollbackAndSetError)
  function inTrx(session, meta, fn) {
    const trx = new ML.Trx(q, env(session)); let r;
    try { r = fn(trx, ML) || { ok: true }; } catch (ex) { r = { ok: false, error: 'model threw: ' + (ex && ex.message) }; trx.say('§MODEL-ERR ' + (ex && ex.stack || ex)); }
    const ok = r.ok !== false, ops = ok ? trx.groupOps() : [];
    let ids = []; if (ok && ops.length) ids = commit(session, ops, meta);
    return Object.assign({}, r, { ok: ok, ops: ops, ids: ids, log: trx.log, trx: trx });
  }
  return { db: db, q: q, one: one, ML: ML, apply: apply, commit: commit, inTrx: inTrx, replay: replay, dispose: dispose, composite: { begin: compositeBegin, commit: compositeCommit, rollback: compositeRollback, end: compositeEnd }, env: env, journal: journal, hooks: hooks, ctxMeta: ctxMeta, colsOf: colsOf, run: function (sql) { sql.split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) db.run(st); }); } };
}
function applier(db, cx) {
  const colsOf = cx.colsOf;
  return function apply(ops, std) {   // std = PO.setStandardDefaults / beforeSave stamps from the session (PO.java:1973-2000): Created/CreatedBy/Updated/UpdatedBy, Client/Org, the UUID column
    const ids = [], fix = (v) => (v && typeof v === 'object' && v.__opRef != null ? ids[v.__opRef] : v);
    ops.forEach(function (o, i) {
      const t = o.table, cs = colsOf(t); if (!cs.length) { ids[i] = null; return; }
      cx.before(Object.assign({}, o, { id: fix(o.id) }), cs, t);
      if (o.op_type === 'CRUD_CREATE') {
        const f = Object.assign({}, o.fields), pk = t + '_id';
        if (cs.indexOf(pk) >= 0) { if (f[pk] == null) f[pk] = cx.newId(t); else cx.seen(t, f[pk]); ids[i] = f[pk]; } else ids[i] = f[t + '_uu'];   // a replayed op already carries its id
        if (std) { if (cs.indexOf('created') >= 0 && f.created == null) f.created = std.now; if (cs.indexOf('createdby') >= 0 && f.createdby == null) f.createdby = std.user; if (cs.indexOf('updated') >= 0 && f.updated == null) f.updated = std.now; if (cs.indexOf('updatedby') >= 0 && f.updatedby == null) f.updatedby = std.user;
          if (cs.indexOf('ad_client_id') >= 0 && f.ad_client_id == null) f.ad_client_id = std.client; if (cs.indexOf('ad_org_id') >= 0 && f.ad_org_id == null) f.ad_org_id = std.org; if (cs.indexOf(t + '_uu') >= 0 && f[t + '_uu'] == null) f[t + '_uu'] = H.uuid(); if (cs.indexOf('isactive') >= 0 && f.isactive == null) f.isactive = 'Y'; }
        Object.keys(f).forEach(function (k) { f[k] = typeof f[k] === 'string' ? f[k].replace(/\{\{opref:(\d+)\}\}/g, function (m, d) { return String(ids[Number(d)]); }) : f[k]; f[k] = fix(f[k]); if (cs.indexOf(k) < 0) delete f[k]; });
        o.fields = f;   // the op now holds exactly what was written (id, stamps, uuid): the journal payload replays it verbatim
        if (cs.indexOf(pk) >= 0) cx.created(t, pk, f[pk]);
        const ks = Object.keys(f); db.run('INSERT INTO ' + t + ' (' + ks.map(function (k) { return '"' + k + '"'; }).join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return f[k] === undefined ? null : f[k]; }));
      } else if (o.op_type === 'CRUD_UPDATE') {
        const kk = Object.keys(o.changes).filter(function (k) { return cs.indexOf(k) >= 0; });
        if (std && kk.length) { if (cs.indexOf('updated') >= 0 && kk.indexOf('updated') < 0) { kk.push('updated'); o.changes.updated = { new: std.now }; } if (cs.indexOf('updatedby') >= 0 && kk.indexOf('updatedby') < 0) { kk.push('updatedby'); o.changes.updatedby = { new: std.user }; } }
        if (kk.length) db.run('UPDATE ' + t + ' SET ' + kk.map(function (k) { return '"' + k + '"=?'; }).join(',') + ' WHERE ' + (o.idCol || t + '_id') + '=?', kk.map(function (k) { return fix(o.changes[k].new); }).concat([fix(o.id)]));
        ids[i] = fix(o.id);
      } else if (o.op_type === 'CRUD_DELETE') db.run('DELETE FROM ' + t + ' WHERE ' + (o.idCol || t + '_id') + '=?', [fix(o.id)]);
    });
    return ids;
  };
}
// replayInto(db, text, o): the ONE journal replay (SHEET_FRONT_DOOR.md §10, W-DOOR-ERP). It needs a database and the shell's hash, nothing else: no model layer, no save hooks, no kernel.
//   The chain is verified FIRST (a broken line refuses the whole text) and every payload must match its opsDigest; then the op groups are applied in order exactly as written
//   (ids, stamps, uuids included). o.apply = a kernel's own apply (build's replay); o.skip(entry) = leave this entry out; o.onEntry(entry) per line;
//   o.atomic = one SQL transaction, all or nothing; o.guard = the target is NOT a fresh seed: every key an entry creates must be free and every row it updates must still hold
//   the `old` value the entry recorded (guardEntry), else the text is refused. Returns { entries, replayed, skipped, ops }.
function replayInto(db, text, o) {
  o = o || {};
  const v = verifyJournal(text); if (!v.ok) throw new Error('journal does not verify: broken at line ' + v.brokenAt + ' (' + v.why + ')');
  const es = text.split('\n').filter(Boolean).map(function (ln) { return JSON.parse(ln); });
  es.forEach(function (e) { if (e.payload && e.payload.ops && H.sha256(JSON.stringify(e.payload.ops)) !== e.opsDigest) throw new Error('journal payload of seq ' + e.seq + ' does not match its digest'); });
  const cols = {}, colsOf = function (t) { return cols[t] || (cols[t] = rowsOf(db, 'PRAGMA table_info(' + t + ')').map(function (c) { return String(c.name).toLowerCase(); })); };
  const apply = o.apply || applier(db, { colsOf: colsOf, newId: function (t) { const m = rowsOf(db, 'SELECT MAX(' + t + '_id) AS m FROM ' + t)[0]; return Math.max(Number(m && m.m || 0), 1000000) + 1; }, seen: function () {}, before: function () {}, created: function () {} });
  let replayed = 0, skipped = 0, ops = 0;
  if (o.atomic) db.run('BEGIN');
  try {
    es.forEach(function (e) {
      if (e.payload && e.payload.ops && !(o.skip && o.skip(e))) { if (o.guard) guardEntry(db, colsOf, e); apply(e.payload.ops, e.payload.std); replayed++; ops += e.payload.ops.length; if (o.onApplied) o.onApplied(e); } else skipped++;
      if (o.onEntry) o.onEntry(e);
    });
    if (o.atomic) db.run('COMMIT');
  } catch (x) { if (o.atomic) db.run('ROLLBACK'); throw x; }
  return { entries: es.length, replayed: replayed, skipped: skipped, ops: ops };
}
function rowsOf(db, sql, params) {
  const st = db.prepare(sql), out = [];
  try { if (params && params.length) st.bind(params); while (st.step()) { const r = st.getAsObject(), l = {}; for (const k in r) l[k.toLowerCase()] = r[k]; out.push(l); } } finally { st.free(); }
  return out;
}
// guardEntry: may this entry be applied to a database that is not the seed it was made on? Reads the ops only (no table is named): a created key must be free; an updated row
//   must exist and hold the `old` value the op recorded (a value the entry itself set earlier counts). Throws with the table, the key and both values.
function guardEntry(db, colsOf, e) {
  const set = {}, made = {}, same = function (a, b) { if (a == null || a === '') return b == null || b === ''; if (b == null || b === '') return false; return (typeof a === 'number' || typeof b === 'number') ? Number(a) === Number(b) : String(a) === String(b); };
  e.payload.ops.forEach(function (o) {
    const t = o.table, cs = colsOf(t); if (!cs.length) return;
    if (o.op_type === 'CRUD_CREATE') {
      const kc = cs.indexOf(t + '_id') >= 0 ? t + '_id' : (cs.indexOf(t + '_uu') >= 0 ? t + '_uu' : null), kv = kc && o.fields ? o.fields[kc] : null;
      if (kv == null) return;
      if (made[t + '|' + kv] || rowsOf(db, 'SELECT 1 AS x FROM ' + t + ' WHERE "' + kc + '"=? LIMIT 1', [kv]).length) throw new Error('entry ' + e.seq + ': ' + t + ' ' + kv + ' is already in these books');
      made[t + '|' + kv] = 1;
    } else if (o.op_type === 'CRUD_UPDATE' || o.op_type === 'CRUD_DELETE') {
      if (o.id && typeof o.id === 'object') return;   // a row this entry itself made
      const kc = o.idCol || t + '_id', row = rowsOf(db, 'SELECT * FROM ' + t + ' WHERE ' + kc + '=?', [o.id])[0];
      if (!row) throw new Error('entry ' + e.seq + ': ' + t + ' ' + o.id + ' is not in these books');
      Object.keys(o.changes || {}).forEach(function (k) {
        const c = o.changes[k], key = t + '|' + o.id + '|' + k; if (!c || cs.indexOf(k) < 0) return;
        if (Object.prototype.hasOwnProperty.call(c, 'old') && !(c.old && typeof c.old === 'object')) { const now = Object.prototype.hasOwnProperty.call(set, key) ? set[key] : row[k]; if (!same(now, c.old)) throw new Error('entry ' + e.seq + ': ' + t + ' ' + o.id + ' ' + k + ' is ' + now + ' in these books, the ledger started from ' + c.old); }
        set[key] = c.new;
      });
    }
  });
}
// verifyJournal(text) -> { ok, entries, actors:{actor:n}, brokenAt } : re-derives every hash from the previous one; a changed, removed or reordered line breaks the chain from there on
function verifyJournal(text) {
  const lines = text.split('\n').filter(Boolean); let prev = '0'.repeat(64); const actors = {}, principals = {};
  for (let i = 0; i < lines.length; i++) {
    let e; try { e = JSON.parse(lines[i]); } catch (x) { return { ok: false, entries: i, actors: actors, brokenAt: i + 1, why: 'unparseable' }; }
    const h = H.sha256(prev + JSON.stringify([e.seq, e.actor, e.meta, e.opsDigest]));
    if (e.prev !== prev || e.hash !== h) return { ok: false, entries: i, actors: actors, brokenAt: i + 1, why: e.prev !== prev ? 'prev-hash' : 'content' };
    actors[e.actor] = (actors[e.actor] || 0) + 1; { const pn = (e.meta && e.meta.onBehalfOf) || '(unsigned)'; principals[pn] = (principals[pn] || 0) + 1; } prev = e.hash;
  }
  return { ok: true, entries: lines.length, actors: actors, principals: principals, brokenAt: null };
}
const api = { load: load, build: build, verifyJournal: verifyJournal, replayInto: replayInto, shell: shell };
if (nodeRequire) module.exports = api; else global.WsKernel = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), typeof module !== 'undefined' && module.exports && typeof require === 'function' ? require : null);
