// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
'use strict';
/**
 * erp_kernel.js — the OP-LOG KERNEL (prompts/ERP_RUNTIME_ENGINE.md T2, ERP_KERNEL_BUILD §P3/P3b).
 *   Spec: docs/ERP.md §0.6 (the rich op-log keystone), §18.6 (dispatch ladder), §18.8 (frozen).
 *
 * The seam the POC was missing: handlers RETURN ops[]; nothing applied + committed them.
 * This kernel closes it (B1 — "the kernel owns the write"):
 *   - Handlers are PURE (doc, ctx) -> ops[]. They get a READ-ONLY ctx (a query fn), never a
 *     writable db. The only way to change state is to RETURN an op.
 *   - Kernel.apply(db, ops, ctx) applies each op to the 5-table projection (schema_5table.sql)
 *     AND commitOp's a RICH op (payload + actor + before/after + lineage GUIDs) to kernel_ops.
 *   - Kernel.dispatch runs the §18.6 ladder: state-machine legal (P2 wfmc) -> guards (evalGuard)
 *     -> Handlers.run -> Kernel.apply, with a VIOLATION guard (handler must not touch the db
 *     except through returned ops — detected by a projection hash that must be unchanged across
 *     Handlers.run).
 *   - Kernel.replay rebuilds the projection from kernel_ops ALONE (event sourcing). Because the
 *     committed op carries resolved ids, replay reproduces old effects regardless of current
 *     rules (frozen effects, §18.8).
 *
 * PROTOTYPE in scripts/ on sql.js (per T2). It does NOT fork bim-ootb/viewer/kernel_ops.js;
 * the commitOp shape here (rich `parameters` JSON) is exactly what that shared module already
 * ALLOWS — relocating (T3) wires this onto it without schema change.
 *
 * IDENTITY IS AN INPUT (ERP.md §0.21 / DistributedERP §7). The kernel_ops PK is an edge-minted
 * `op_uuid` (was INTEGER AUTOINCREMENT — two devices' rowids collide and can't union). Every entity
 * `output_guid` is stamped ONCE at first apply (`edgeMint`, recorded into the op payload) and the
 * replay path RE-READS it — `edgeMint` never runs on replay, so identity is never re-computed.
 * Deterministic: op ids + entity ids + timestamps are all inputs (no Date.now / Math.random) so
 * replay is exact and two devices' logs union clash-free (witness build/erp/poc_identity.log).
 */

// ── projection schema (a self-contained copy of schema_5table.sql's runtime tables) ──
var PROJECTION_SQL =
  'CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, doc_type TEXT, doc_status TEXT DEFAULT \'DR\', source_id TEXT, parent_id TEXT, container_id TEXT, metadata TEXT DEFAULT \'{}\');' +
  'CREATE TABLE IF NOT EXISTS document_lines (id TEXT PRIMARY KEY, document_id TEXT, source_line_id TEXT, line_no INTEGER, match_type TEXT, metadata TEXT DEFAULT \'{}\');' +
  'CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, parent_id TEXT, type TEXT, metadata TEXT DEFAULT \'{}\');' +
  'CREATE TABLE IF NOT EXISTS containers (id TEXT PRIMARY KEY, parent_id TEXT, type TEXT, metadata TEXT DEFAULT \'{}\');' +
  // §13.1: journal extended from settlement-edge to double-entry — account_id/amtacctdr/amtacctcr
  // mirror gl_journalline. NULL/0 defaults keep ALLOCATE (5-col insert) backward-compatible.
  'CREATE TABLE IF NOT EXISTS journal (id TEXT PRIMARY KEY, batch_id TEXT, journal_id TEXT, source TEXT, account_id TEXT, amtacctdr REAL DEFAULT 0, amtacctcr REAL DEFAULT 0, metadata TEXT DEFAULT \'{}\');';
// I-4 (prompts/I4_OPLOG_RECONCILE.md): the seam's op-log IS the genuinely-signed W-CHAIN/W-SIGN log —
// ONE schema, the superset owned by kernel_ops.js (id PK total-order + op_uuid cross-device identity +
// prev_hash/op_hash/sig). apply() below still inserts only the shared columns (id auto-fills, chain cols
// stay NULL until sealChain signs them); replay() reads op_type/parameters verbatim. In the browser
// kernel_ops.js is the canonical owner; in node (no window) we create the identical shape here.
var KERNEL_OPS_SQL =
  'CREATE TABLE IF NOT EXISTS kernel_ops (id INTEGER PRIMARY KEY, op_uuid TEXT, timestamp INTEGER, op_type TEXT, parameters TEXT, input_guids TEXT, output_guid TEXT, undone INTEGER DEFAULT 0, prev_hash TEXT, op_hash TEXT, sig TEXT, user_tag TEXT DEFAULT \'local\');';
var PROJECTION_TABLES = ['documents', 'document_lines', 'items', 'containers', 'journal'];

function initProjection(db) {
  db.run(PROJECTION_SQL);
  // unified signed op-log (I-4): kernel_ops.js owns the canonical table in the browser; create the same
  // shape in node. Either way `id` is the PRIMARY KEY (rowid alias) the W-CHAIN totals over — see D1.
  if (typeof window !== 'undefined' && window.KernelOps && window.KernelOps.ensureTable) window.KernelOps.ensureTable(db);
  else db.run(KERNEL_OPS_SQL);
}

// host query helper over a sql.js db -> rows[] of plain objects.
function query(db, sql, params) {
  var r = db.exec(sql, params || []);
  if (!r.length) return [];
  return r[0].values.map(function (v) { var o = {}; r[0].columns.forEach(function (c, i) { o[c] = v[i]; }); return o; });
}

// deterministic djb2 over the whole projection (sorted) — the replay equality witness.
function projectionHash(db) {
  var acc = 5381;
  PROJECTION_TABLES.forEach(function (t) {
    var rows = query(db, 'SELECT * FROM ' + t + ' ORDER BY id');
    var s = t + '=' + JSON.stringify(rows);
    for (var i = 0; i < s.length; i++) { acc = ((acc << 5) + acc + s.charCodeAt(i)) | 0; }
  });
  return (acc >>> 0).toString(16);
}

// ── edge-mint: identity is SUPPLIED to the kernel as an INPUT (§0.21 / DistributedERP §7) ────
// Runs at most ONCE, at first apply, ONLY when an op arrives without op.uuid — modelling the edge
// minting a doc's id before it enters the kernel. The result is recorded into the op payload; the
// replay path finds op.uuid already present and NEVER calls this (recompute=0 → §7 holds). For
// source-derived docs it reproduces the prior DOC:/LINE: string so §ORACLE-SUITE/§LONGTAIL stay
// byte-stable; a source-less New doc (D4) arrives with a crypto.randomUUID() already in op.uuid.
var _stats = { edgeMintCalls: 0 };               // white-box witness: must be 0 across a replay
function edgeMint(op) {
  _stats.edgeMintCalls++;
  switch (op.op_type) {
    case 'CREATE_DOCUMENT': return 'DOC:' + op.table + '@from' + (op.source_id != null ? op.source_id : 'NA');
    case 'SET_STATUS':      return 'DOC:' + op.table + '#' + op.id;                  // a doc's own id
    case 'CREATE_LINE':     return 'LINE:' + op.table + '@from' + (op.source_line_id != null ? op.source_line_id : 'NA');
    case 'ALLOCATE':        return 'ALLOC:' + op.payment_id + ':' + (op.invoice_id != null ? 'inv' + op.invoice_id : 'ord' + op.order_id);
    case 'MATCH':           return 'MATCH:' + op.table + '@' + op.source_line_id + ':' + op.counterpart_line_id;
    case 'POST':            return 'POST:' + op.table + '#' + op.id;                 // the journal batch id
    default: throw new Error('edgeMint: unknown op_type ' + op.op_type);
  }
}
function metaOf(op, drop) {
  var m = {}; Object.keys(op).forEach(function (k) { if (drop.indexOf(k) < 0) m[k] = op[k]; }); return m;
}

// ── apply ONE op to the projection; returns {output_guid, input_guids, before, after} ──
// The entity identity is op.uuid — a RECORDED INPUT (stamped by `apply` at first application,
// re-read verbatim on replay). applyOne never computes identity; references to OTHER entities
// (a shared source id, the in-log currentDoc) are resolved the same way on apply and replay.
function applyOne(db, op, state) {
  var guid = op.uuid, before = null, after = null, inputs = [];
  if (op.op_type === 'CREATE_DOCUMENT') {
    inputs = op.source_id != null ? [String(op.source_id)] : [];
    var meta = metaOf(op, ['op_type', 'table', 'source_id', 'doc_status', 'uuid', 'op_uuid']);
    db.run('INSERT OR REPLACE INTO documents (id, doc_type, doc_status, source_id, metadata) VALUES (?,?,?,?,?)',
      [guid, op.table, op.doc_status || 'DR', op.source_id != null ? String(op.source_id) : null, JSON.stringify(meta)]);
    state.currentDoc = guid; after = guid;
    return { output_guid: guid, input_guids: inputs, before: before, after: after };
  }
  if (op.op_type === 'CREATE_LINE') {
    inputs = op.source_line_id != null ? [String(op.source_line_id)] : [];
    var lmeta = metaOf(op, ['op_type', 'table', 'source_line_id', 'line_no', 'match_type', 'uuid', 'op_uuid']);
    db.run('INSERT OR REPLACE INTO document_lines (id, document_id, source_line_id, line_no, match_type, metadata) VALUES (?,?,?,?,?,?)',
      [guid, state.currentDoc || null, op.source_line_id != null ? String(op.source_line_id) : null, op.line_no != null ? op.line_no : null, op.match_type || null, JSON.stringify(lmeta)]);
    return { output_guid: guid, input_guids: state.currentDoc ? [state.currentDoc] : inputs, before: before, after: guid };
  }
  if (op.op_type === 'SET_STATUS') {
    var prev = query(db, 'SELECT doc_status FROM documents WHERE id=?', [guid]);
    before = prev.length ? prev[0].doc_status : null;
    // upsert: an order doc may not be in the projection yet (it pre-exists in source).
    db.run('INSERT INTO documents (id, doc_type, doc_status, metadata) VALUES (?,?,?,?) ' +
      'ON CONFLICT(id) DO UPDATE SET doc_status=excluded.doc_status',
      [guid, op.table, op.doc_status, '{}']);
    after = op.doc_status;
    return { output_guid: guid, input_guids: [String(op.id)], before: before, after: after };
  }
  if (op.op_type === 'ALLOCATE') {
    // settlement edge: link Order/Invoice <-> Payment + amount, as a journal entry (Batch->Journal).
    var target = op.invoice_id != null ? 'C_Invoice#' + op.invoice_id : 'C_Order#' + op.order_id;
    db.run('INSERT OR REPLACE INTO journal (id, batch_id, journal_id, source, metadata) VALUES (?,?,?,?,?)',
      [guid, 'BATCH@pay' + op.payment_id, 'JRN@pay' + op.payment_id, 'DOC:' + target, JSON.stringify(metaOf(op, ['op_type', 'uuid', 'op_uuid']))]);
    return { output_guid: guid, input_guids: ['DOC:' + target, 'DOC:C_Payment#' + op.payment_id], before: null, after: guid };
  }
  if (op.op_type === 'MATCH') {
    // settlement edge (§0.1 document_lines.match_type): a row LINKING >=2 lines across documents.
    // source_line_id -> one line; counterpart line-ref + qty in metadata; tagged match_type.
    // This is GENERATE output of the §0.14 matcher — a "must-agree" edge in the settlement DAG.
    var mmeta = metaOf(op, ['op_type', 'table', 'source_line_id', 'match_type', 'uuid', 'op_uuid']);
    db.run('INSERT OR REPLACE INTO document_lines (id, document_id, source_line_id, match_type, metadata) VALUES (?,?,?,?,?)',
      [guid, 'DOC:' + op.table, String(op.source_line_id), op.match_type || op.table, JSON.stringify(mmeta)]);
    return { output_guid: guid, input_guids: [String(op.source_line_id), String(op.counterpart_line_id)], before: null, after: guid };
  }
  if (op.op_type === 'POST') {
    // §13.1 POST verb — receives ALREADY-RESOLVED, ALREADY-BALANCED lines (the §3.5.1 resolver is host
    // glue; no account logic here). The verb owns the double-entry INVARIANT: ΣamtacctDR == ΣamtacctCR,
    // checked to the cent BEFORE any write. One journal row per line; ids derive from the batch guid so
    // replay reproduces the same rows byte-for-byte. INSERT OR REPLACE = idempotent on replay.
    var lines = op.lines || [];
    var sdr = 0, scr = 0;
    lines.forEach(function (l) { sdr += Number(l.amtacctdr || 0); scr += Number(l.amtacctcr || 0); });
    if (Math.round(sdr * 100) !== Math.round(scr * 100)) {
      throw new Error('POST unbalanced ΣDR=' + sdr.toFixed(2) + ' ΣCR=' + scr.toFixed(2) + ' (' + op.table + '#' + op.id + ')');
    }
    var src = 'DOC:' + op.table + '#' + op.id;
    lines.forEach(function (l, i) {
      db.run('INSERT OR REPLACE INTO journal (id, batch_id, journal_id, source, account_id, amtacctdr, amtacctcr, metadata) VALUES (?,?,?,?,?,?,?,?)',
        [guid + ':' + i, 'BATCH@' + guid, 'JRN@' + guid, src, String(l.account_id),
         Number(l.amtacctdr || 0), Number(l.amtacctcr || 0),
         JSON.stringify({ role: l.role || null, source_col: l.source_col || null, acctschema: op.acctschema != null ? op.acctschema : null })]);
    });
    return { output_guid: guid, input_guids: [src], before: null, after: guid };
  }
  throw new Error('unknown op_type ' + op.op_type);
}

// ── Kernel.apply — apply ops[] to projection AND commit a RICH op per op ─────
function apply(db, ops, ctx) {
  initProjection(db);
  ctx = ctx || {}; var actor = ctx.actor || 'local'; var ts = ctx.baseTs || 1000;
  // global per-device order: continue numbering across apply() calls so op_uuid/timestamp are
  // unique within a device's log (was implicit via the old AUTOINCREMENT rowid).
  var seqBase = query(db, 'SELECT COUNT(*) AS c FROM kernel_ops')[0].c;
  // op-id mint: injectable (prod erp.html passes crypto.randomUUID); default is the deterministic
  // actor-prefixed sequence so two devices union clash-free with NO randomness (§0.16 replay-safe).
  var mintOp = ctx.mintOp || function (op, gseq) { return actor + ':' + (ts + gseq); };
  var state = { currentDoc: ctx.currentDoc || null };
  var committed = 0, ids = [];
  ops.forEach(function (op, i) {
    var gseq = seqBase + i;
    // D1/D2 — stamp identity as RECORDED INPUTS (edge mint, §0.21/§7). Idempotent: an op that
    // already carries uuid/op_uuid (a New doc from the UI, or a replayed/merged op) keeps them,
    // so edgeMint/mintOp never run twice and the replay path re-reads, never re-computes.
    if (op.uuid == null) op.uuid = edgeMint(op);
    if (op.op_uuid == null) op.op_uuid = mintOp(op, gseq);
    var res = applyOne(db, op, state);
    // RICH op (§0.6 keystone): payload (now carrying the recorded uuid) + actor + before/after + lineage GUIDs.
    var rich = { payload: op, actor: actor, before: res.before, after: res.after, lineage: { input_guids: res.input_guids, output_guid: res.output_guid } };
    // T1 (W-T1-ATTRIB, FABLE5_WRAPUP §3): employee attribution rides the CONTENT-SIGNED parameters as
    // audit metadata — user_tag stays the device actor (owner-gate grain unchanged), the sig stays the
    // device key. Conditional: absent ctx.attrib → byte-identical rich op (back-compat, default-off).
    if (ctx.attrib) rich.attrib = ctx.attrib;
    db.run('INSERT INTO kernel_ops (op_uuid, timestamp, op_type, parameters, input_guids, output_guid, user_tag) VALUES (?,?,?,?,?,?,?)',
      [op.op_uuid, ts + gseq, op.op_type, JSON.stringify(rich), JSON.stringify(res.input_guids), res.output_guid, actor]);
    committed++; ids.push(res.output_guid);
  });
  return { applied: ops.length, committed: committed, ids: ids };
}

// ── Kernel.replay — rebuild the projection from kernel_ops ALONE (event sourcing) ──
// Re-applies each committed op's STORED payload (resolved ids) into a fresh projection.
// Because we re-apply stored ops (not re-evaluate rules), old effects are FROZEN (§18.8).
function replay(srcDbWithLog, freshDb) {
  initProjection(freshDb);
  var log = query(srcDbWithLog, 'SELECT op_type, parameters FROM kernel_ops WHERE undone=0 ORDER BY rowid');
  var state = { currentDoc: null };
  var n = 0;
  log.forEach(function (row) {
    var rich = JSON.parse(row.parameters);
    if (!rich.payload) return;                 // skip non-document ops (e.g. SESSION_START)
    applyOne(freshDb, rich.payload, state); n++;
  });
  return { ops: n, hash: projectionHash(freshDb) };
}

// ── projection snapshot/restore (generic SQL — works on sql.js AND better-sqlite3) ──
// Used to roll back a detected out-of-log write so the live projection stays == the log.
function snapshotProjection(db) {
  var s = {}; PROJECTION_TABLES.forEach(function (t) { s[t] = query(db, 'SELECT * FROM ' + t); }); return s;
}
function restoreProjection(db, s) {
  PROJECTION_TABLES.forEach(function (t) {
    db.run('DELETE FROM ' + t);
    s[t].forEach(function (row) {
      var cols = Object.keys(row);
      db.run('INSERT INTO ' + t + ' (' + cols.join(',') + ') VALUES (' + cols.map(function () { return '?'; }).join(',') + ')', cols.map(function (c) { return row[c]; }));
    });
  });
}

// ── state machine (P2 wfmc) ─────────────────────────────────────────────────
function legalTransition(wfmc, fromStatus, action) {
  var hit = (wfmc.transitions || []).filter(function (t) { return t[0] === fromStatus && t[1] === action; });
  return hit.length ? hit[0][2] : null;        // the 'to' status, or null if illegal
}

// ── handler registry ────────────────────────────────────────────────────────
var _handlers = {};
function register(docType, action, fn) { _handlers[docType + ':' + action] = fn; }
function getHandler(docType, action) { return _handlers[docType + ':' + action] || null; }
// read-only reflection over the registry (ENGINE_CONTRACT §1 verbs(ctx)) — no new engine logic,
// just enumerates what register() already recorded. Optional docType filter.
function handlers(docType) {
  return Object.keys(_handlers).map(function (k) { var p = k.indexOf(':'); return { docType: k.slice(0, p), action: k.slice(p + 1) }; })
    .filter(function (h) { return docType == null || h.docType === docType; });
}

// ── Kernel.dispatch — the §18.6 ladder with the violation guard ─────────────
// cellCtx = { wfmc, guards[], query(sql)->rows (READ-ONLY data), actor, baseTs }
// doc     = { docType, action, status, ... } whatever the handler needs (read-only)
function dispatch(db, cellCtx, doc) {
  var docType = doc.docType, action = doc.action;
  // 1) state-machine legal?
  var to = legalTransition(cellCtx.wfmc, doc.status, action);
  if (!to) return { ok: false, stage: 'state-machine', reason: 'illegal (' + doc.status + ',' + action + ')' };
  // 2) guards (evalGuard) — non-sql / unresolved-ctx guards are skipped (logged), not failed.
  var guardFails = [];
  (cellCtx.guards || []).forEach(function (g) {
    if (cellCtx.evalGuard) {
      var r = cellCtx.evalGuard(cellCtx.query, g, doc.ctx || {});
      if (!r.ok && r.reason === 'sql-error') guardFails.push(g.rule_key + ':' + r.reason);
    }
  });
  if (guardFails.length) return { ok: false, stage: 'guard', reason: guardFails.join(',') };
  // 3) Handlers.run — PURE: hand it only a read-only query, NEVER db. Violation guard: the
  //    projection must not change across the handler call (a handler that writes is BLOCKED).
  var handler = getHandler(docType, action);
  if (!handler) return { ok: false, stage: 'handler', reason: 'unwritten-cell (' + docType + ',' + action + ')' };
  var hashBefore = projectionHash(db);
  var snap = snapshotProjection(db);
  var ops;
  try { ops = handler(doc, { query: cellCtx.query, to: to }) || []; }
  catch (e) { return { ok: false, stage: 'handler', reason: 'threw:' + e.message }; }
  var hashAfter = projectionHash(db);
  if (hashBefore !== hashAfter) {
    restoreProjection(db, snap);              // roll back the rogue write — the log stays the truth
    return { ok: false, stage: 'violation', reason: 'out-of-log-write', blocked: true };
  }
  // 4) Kernel.apply — the kernel (not the handler) owns the write.
  var res = apply(db, ops, { actor: cellCtx.actor, baseTs: cellCtx.baseTs });
  return { ok: true, to: to, ops: ops, applied: res.applied, committed: res.committed, ids: res.ids };
}

var _api = {
  initProjection: initProjection, query: query, projectionHash: projectionHash,
  apply: apply, replay: replay, legalTransition: legalTransition,
  register: register, getHandler: getHandler, handlers: handlers, dispatch: dispatch,
  PROJECTION_TABLES: PROJECTION_TABLES, _stats: _stats
};
// UMD tail — node (tests/pocs) AND browser (window.ERPKernel for the live host). Same proven engine,
// no fork: db.run/db.exec are already sql.js-compatible (this kernel was written to run on sql.js).
if (typeof module !== 'undefined' && module.exports) { module.exports = _api; }
if (typeof window !== 'undefined') { window.ERPKernel = _api; }
