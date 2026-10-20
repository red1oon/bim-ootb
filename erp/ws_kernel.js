// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ws_kernel.js - the headless Kernel ERP the web service writes through (bim-compiler prompts/ERP_WS_API.md S2/S3).
//   ONE write path: every create/update/delete/doc-action is the model layer's own save()/remove()/processIt() (erp/model_layer.js) inside ONE Trx whose op group is applied
//   to this kernel's DB and appended, signed-in-order, to its op journal with the caller's actor. The API adds no write logic of its own.
//   Pure of HTTP; the host (ws_server.js) owns the sockets. Same DB the page loads: ad_seed.db + patches/ad_seed.db.sql (+ tenant SQL).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
function load(extraSql) {
  const initSqlJs = require(process.env.SQLJS || (os.homedir() + '/bim-ootb/tests/node_modules/sql.js'));
  return initSqlJs().then(function (SQL) {
    const db = new SQL.Database(fs.readFileSync(path.join(__dirname, 'ad_seed.db')));
    const run = (txt) => txt.split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { db.run(st); } catch (e) { /* the page's per-statement tolerance */ } });
    const pf = path.join(__dirname, 'patches/ad_seed.db.sql'); if (fs.existsSync(pf)) run(fs.readFileSync(pf, 'utf8'));
    (extraSql || []).forEach(function (f) { run(fs.readFileSync(f, 'utf8')); });
    return build(db);
  });
}
function build(db) {
  const A = require('./ad_callout.js');
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require('./callouts/' + m + '.js'); });
  A.RUNTIME.registerSqlFunctions(function (n, f) { db.create_function(n, f); });
  const ML = require('./model_layer.js');
  fs.readdirSync(path.join(__dirname, 'processes')).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) { try { require('./processes/' + f); } catch (e) { /* a port needing a browser-only global stays unregistered, named by the process answer */ } });
  ['model_trade', 'model_ctor', 'model_cost', 'model_match', 'model_order', 'model_invoice', 'model_post', 'model_master'].forEach(function (m) { require('./' + m + '.js'); });
  function q(sql, params) {
    const st = db.prepare(sql), out = [];
    try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; })); while (st.step()) { const o = st.getAsObject(), r = {}; for (const k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); }
    return out;
  }
  const one = (sql, p) => q(sql, p || [])[0] || null;
  // the page's §AD-MODELVAL-LIVE install (crud_overlay.js _installAllModelVal): every ported M*.beforeSave validator, db captured in the hook closures. Without it a web-service save skipped them all.
  const MV = require('./ad_modelval.js'), shim = { prepare: function (sql) { const flat = (a) => [].concat.apply([], [].slice.call(a)); return { all: function () { return q(sql, flat(arguments)); }, get: function () { return q(sql, flat(arguments))[0]; } }; } };
  Object.keys(MV).forEach(function (m) { if (/^install[A-Z].*SaveHooks$/.test(m) && typeof MV[m] === 'function') { try { MV[m](shim); } catch (e) { console.log('§WS modelval installer ' + m + ' skipped (' + e.message + ')'); } } });
  if (typeof MV.installDefaultHooks === 'function') { try { MV.installDefaultHooks(); } catch (e) { /* none */ } }
  const cols = {}, nextId = {};
  const colsOf = (t) => cols[t] || (cols[t] = q('PRAGMA table_info(' + t + ')').map(function (c) { return c.name.toLowerCase(); }));
  function newId(t) { if (nextId[t] == null) { const m = one('SELECT MAX(' + t + '_id) AS m FROM ' + t); nextId[t] = Math.max(Number(m.m || 0), 1000000); } return ++nextId[t]; }
  // apply an op group the way commitGroup + the listTip fold do (CREATE gets a fresh key, {__opRef}/{{opref:n}} resolved, UPDATE/DELETE by key)
  let comp = null;   // composite transaction (CompositeServiceImpl): ops apply at once (later operations must see them) with an undo log; the journal waits for the commit
  function undoOf(o, cs, t) {
    const idc = o.idCol || t + '_id';
    if (o.op_type === 'CRUD_UPDATE' || o.op_type === 'CRUD_DELETE') { const rid = (o.id && typeof o.id === 'object' && o.id.__opRef != null) ? null : o.id; const row = rid == null ? null : one('SELECT * FROM ' + t + ' WHERE ' + idc + '=?', [rid]); if (row) comp.undo.push({ kind: o.op_type === 'CRUD_UPDATE' ? 'restore' : 'reinsert', table: t, idc: idc, id: rid, row: row }); }
  }
  function apply(ops, std) {   // std = PO.setStandardDefaults / beforeSave stamps from the session (PO.java:1973-2000): Created/CreatedBy/Updated/UpdatedBy, Client/Org, the UUID column
    const ids = [], fix = (v) => (v && typeof v === 'object' && v.__opRef != null ? ids[v.__opRef] : v);
    ops.forEach(function (o, i) {
      const t = o.table, cs = colsOf(t); if (!cs.length) { ids[i] = null; return; }
      if (comp) undoOf(Object.assign({}, o, { id: fix(o.id) }), cs, t);
      if (o.op_type === 'CRUD_CREATE') {
        const f = Object.assign({}, o.fields), pk = t + '_id';
        if (cs.indexOf(pk) >= 0) { f[pk] = newId(t); ids[i] = f[pk]; } else ids[i] = f[t + '_uu'];
        if (std) { if (cs.indexOf('created') >= 0 && f.created == null) f.created = std.now; if (cs.indexOf('createdby') >= 0 && f.createdby == null) f.createdby = std.user; if (cs.indexOf('updated') >= 0 && f.updated == null) f.updated = std.now; if (cs.indexOf('updatedby') >= 0 && f.updatedby == null) f.updatedby = std.user;
          if (cs.indexOf('ad_client_id') >= 0 && f.ad_client_id == null) f.ad_client_id = std.client; if (cs.indexOf('ad_org_id') >= 0 && f.ad_org_id == null) f.ad_org_id = std.org; if (cs.indexOf(t + '_uu') >= 0 && f[t + '_uu'] == null) f[t + '_uu'] = crypto.randomUUID(); if (cs.indexOf('isactive') >= 0 && f.isactive == null) f.isactive = 'Y'; }
        Object.keys(f).forEach(function (k) { f[k] = typeof f[k] === 'string' ? f[k].replace(/\{\{opref:(\d+)\}\}/g, function (m, d) { return String(ids[Number(d)]); }) : f[k]; f[k] = fix(f[k]); if (cs.indexOf(k) < 0) delete f[k]; });
        if (comp && cs.indexOf(pk) >= 0) comp.undo.push({ kind: 'delete', table: t, idc: pk, id: f[pk] });
        const ks = Object.keys(f); db.run('INSERT INTO ' + t + ' (' + ks.map(function (k) { return '"' + k + '"'; }).join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return f[k] === undefined ? null : f[k]; }));
      } else if (o.op_type === 'CRUD_UPDATE') {
        const kk = Object.keys(o.changes).filter(function (k) { return cs.indexOf(k) >= 0; });
        if (std && kk.length) { if (cs.indexOf('updated') >= 0 && kk.indexOf('updated') < 0) { kk.push('updated'); o.changes.updated = { new: std.now }; } if (cs.indexOf('updatedby') >= 0 && kk.indexOf('updatedby') < 0) { kk.push('updatedby'); o.changes.updatedby = { new: std.user }; } }
        if (kk.length) db.run('UPDATE ' + t + ' SET ' + kk.map(function (k) { return '"' + k + '"=?'; }).join(',') + ' WHERE ' + (o.idCol || t + '_id') + '=?', kk.map(function (k) { return fix(o.changes[k].new); }).concat([fix(o.id)]));
        ids[i] = fix(o.id);
      } else if (o.op_type === 'CRUD_DELETE') db.run('DELETE FROM ' + t + ' WHERE ' + (o.idCol || t + '_id') + '=?', [fix(o.id)]);
    });
    return ids;
  }
  let clock = Date.now(), uu = 0;
  function env(s) {   // the session of the WS login, like Env.getCtx() for the request
    clock += 1000; const d = new Date(clock), day = d.toISOString().slice(0, 10);
    return { client: s.clientId, org: s.orgId, user: s.userId, role: s.roleId, date: day + ' 00:00:00', now: d.toISOString().slice(0, 19).replace('T', ' '), nowMillis: clock, ctx: { m_warehouse_id: s.warehouseId },   // Env.getContextAsInt(ctx, "#M_Warehouse_ID") of the WS login (MOrder.beforeSave :1206-1215)
      uuid: function () { uu++; return crypto.randomUUID(); } };
  }
  const journal = [], hooks = { onJournal: null }, ctxMeta = { v: null };   // ctxMeta.v: extra journal meta for the call in flight (e.g. approvedBy)   // the kernel's own ordered op history: every entry names the caller's actor and chains the hash of the one before (ERP_WS_API.md S5)
  function commit(session, ops, meta) {
    const e0 = env(session), ids = apply(ops, { now: e0.now, user: e0.user, client: e0.client, org: e0.org });
    if (comp) { comp.pend.push({ session: session, ops: ops, meta: (meta || ctxMeta.v) ? Object.assign({}, meta || {}, ctxMeta.v || {}) : null }); return ids; }
    return journalOf(session, ops, meta ? Object.assign({}, meta, ctxMeta.v || {}) : (ctxMeta.v ? Object.assign({}, ctxMeta.v) : null), ids);
  }
  function journalOf(session, ops, metaAll, ids) {
    const prev = journal.length ? journal[journal.length - 1].hash : '0'.repeat(64);
    const entry = { seq: (journal.length ? journal[journal.length - 1].seq : 0) + 1, actor: session.actor || ('user:' + session.userId), at: new Date().toISOString(), meta: metaAll, ops: ops.length, opsDigest: crypto.createHash('sha256').update(JSON.stringify(ops)).digest('hex'), prev: prev };
    entry.hash = crypto.createHash('sha256').update(prev + JSON.stringify([entry.seq, entry.actor, entry.meta, entry.opsDigest])).digest('hex');
    journal.push(entry); if (hooks.onJournal) hooks.onJournal(entry); return ids;
  }
  function compositeBegin() { comp = { undo: [], pend: [] }; }
  function compositeCommit() { if (!comp) return; const p = comp.pend; comp.undo = []; comp.pend = []; p.forEach(function (x) { journalOf(x.session, x.ops, x.meta, []); }); }   // the journal gets the group at commit, in order
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
  return { db: db, q: q, one: one, ML: ML, apply: apply, commit: commit, inTrx: inTrx, composite: { begin: compositeBegin, commit: compositeCommit, rollback: compositeRollback, end: compositeEnd }, env: env, journal: journal, hooks: hooks, ctxMeta: ctxMeta, colsOf: colsOf, run: function (sql) { sql.split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) db.run(st); }); } };
}
// verifyJournal(text) -> { ok, entries, actors:{actor:n}, brokenAt } : re-derives every hash from the previous one; a changed, removed or reordered line breaks the chain from there on
function verifyJournal(text) {
  const lines = text.split('\n').filter(Boolean); let prev = '0'.repeat(64); const actors = {}, principals = {};
  for (let i = 0; i < lines.length; i++) {
    let e; try { e = JSON.parse(lines[i]); } catch (x) { return { ok: false, entries: i, actors: actors, brokenAt: i + 1, why: 'unparseable' }; }
    const h = crypto.createHash('sha256').update(prev + JSON.stringify([e.seq, e.actor, e.meta, e.opsDigest])).digest('hex');
    if (e.prev !== prev || e.hash !== h) return { ok: false, entries: i, actors: actors, brokenAt: i + 1, why: e.prev !== prev ? 'prev-hash' : 'content' };
    actors[e.actor] = (actors[e.actor] || 0) + 1; { const pn = (e.meta && e.meta.onBehalfOf) || '(unsigned)'; principals[pn] = (principals[pn] || 0) + 1; } prev = e.hash;
  }
  return { ok: true, entries: lines.length, actors: actors, principals: principals, brokenAt: null };
}
module.exports = { load: load, build: build, verifyJournal: verifyJournal };
