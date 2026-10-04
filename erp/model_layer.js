// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// model_layer.js — the iDempiere PO + DocAction + DocumentEngine + workflow CONTRACT, ported as ONE generic
// layer (bim-compiler prompts/ERP_MODEL_LAYER.md §DESIGN — Witness: W-MODEL-ORACLE / W-MODEL-OPGROUP / W-MODEL-PLUGIN).
//
// What it is: the place a save or a DocAction WRITES. Rules (model_trade.js, or a Ninja/plugin bundle) register
// into it; it never names a table itself (AD-LAYER LAW rule 1). Three parts:
//   Trx           — the unit of work (Java: one trxName). Read-your-writes over a HOST-INJECTED reader; every
//                   write becomes one of the EXISTING op shapes (CRUD_CREATE with {__opRef:i} FKs / CRUD_UPDATE
//                   {old,new} / CRUD_DELETE) that crud_overlay applyOpGroup + KernelOps.commitGroup seal as ONE
//                   group. Nothing writes outside it (AD_Sequence included — MSequence rides the same Trx).
//   save/delete   — PO.save / PO.delete: model beforeSave → BEFORE_NEW|CHANGE validators → write → model
//                   afterSave → AFTER_NEW|CHANGE (PO.java saveNew/saveUpdate order). Validators = ad_modelval.js.
//   processIt     — DocumentEngine.processIt (process/DocumentEngine.java:301-360, prepareIt :489) over the
//                   DocAction class REGISTERED for the table (registerDocAction — the document-action extension
//                   point a plugin uses to bring its own class). runWorkflow = the UI path (DocAction column →
//                   AD_Process.AD_Workflow_ID → MWFProcess/MWFActivity, writing AD_WF_* rows in the same Trx).
// PURE: no DB binding, no Date.now/Math.random — the host injects query(sql,params)->rows (lower-case keys),
// env.now (recorded clock), env.uuid() (recorded identity), env.user/client/org. Replay-deterministic.
'use strict';
(function (root, factory) {
  var api;
  if (typeof module !== 'undefined' && module.exports) {
    api = factory(require('./bigdecimal'), require('./ad_modelval'), (function () { try { return require('./ad_workflow'); } catch (e) { return null; } })());
    module.exports = api;
  } else {
    api = factory(root.BigDecimal, root.AdModelVal, root.AdWorkflow);
    root.ModelLayer = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (BigDecimal, MV, WF) {

  var NEW = '#new:';
  function isNewId(v) { return typeof v === 'string' && v.indexOf(NEW) === 0; }
  function lc(r) { var o = {}; for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) o[String(k).toLowerCase()] = r[k]; return o; }
  function same(a, b) { return String(a == null ? '' : a) === String(b == null ? '' : b); }

  // ── BigDecimal helpers — every money/qty value enters through D() (never raw float arithmetic) ───────────
  function D(v) {
    if (v == null || v === '') return BigDecimal.ZERO;
    if (v instanceof BigDecimal) return v;
    if (typeof v === 'number') { if (Number.isInteger(v)) return BigDecimal.of(v); return BigDecimal.fromString(String(v)); }
    return BigDecimal.fromString(String(v));
  }
  function N(bd) { return bd == null ? null : Number(D(bd).toString()); }   // the store is REAL — converted once, at write

  // ── key columns from the DICTIONARY (AD_Column.IsKey, else IsParent) — never a hand table list ──────────
  var _keyCache = {};
  function keyColsOf(q, table) {
    if (_keyCache[table]) return _keyCache[table];
    var cols = [];
    try {
      var rows = q("SELECT c.columnname AS c, c.iskey AS k, c.isparent AS p FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=? AND c.isactive='Y'", [table]);
      var keys = rows.filter(function (r) { return r.k === 'Y'; });
      if (!keys.length) keys = rows.filter(function (r) { return r.p === 'Y'; });
      cols = keys.map(function (r) { return String(r.c).toLowerCase(); });
    } catch (e) { cols = []; }
    if (!cols.length) cols = [table + '_id'];
    return (_keyCache[table] = cols);
  }

  // is `col` an AD_Column.IsKey column of `table` (vs the IsParent fallback keyColsOf uses when a table has no IsKey column)
  var _realKey = {};
  function isRealKey(q, table, col) {
    var k = table + '.' + col;
    if (k in _realKey) return _realKey[k];
    var r = false;
    try { r = q("SELECT 1 AS x FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=? AND lower(c.columnname)=? AND c.iskey='Y' AND c.isactive='Y'", [table, col]).length > 0; } catch (e) { r = true; }
    return (_realKey[k] = r);
  }

  var _ddl = {};
  function ddlDefaults(trx, table) {
    if (_ddl[table]) return _ddl[table];
    var o = {};
    try { trx.q('SELECT columnname AS c, defaultvalue AS d FROM ad_ddl_default WHERE tablename=?', [table]).forEach(function (r) { o[r.c] = /^-?\d+(\.\d+)?$/.test(r.d) ? Number(r.d) : r.d; }); } catch (e) {}
    return (_ddl[table] = o);
  }

  // ══ Trx — the unit of work ══════════════════════════════════════════════════════════════════════════════
  function Trx(query, env) {
    if (!(this instanceof Trx)) return new Trx(query, env);
    this.q = function (sql, params) { return (query(sql, params || []) || []).map(lc); };
    this.env = env || {};
    this.ops = [];                 // the group, in write order
    this.pend = {};                // table -> idKey -> {row, orig, isNew, opIdx, deleted}
    this.log = [];                 // §-lines the rules emit (host prints them; the witness reads them)
    this._newSeq = 0;
  }
  Trx.prototype.keyCols = function (table) { return keyColsOf(this.q, table); };
  // single-column identity of a row: its key when the key is one column, else its <table>_uu (recorded identity).
  Trx.prototype.idCol = function (table) { var k = this.keyCols(table); return k.length === 1 ? k[0] : table + '_uu'; };
  Trx.prototype._p = function (table) { return (this.pend[table] = this.pend[table] || {}); };
  Trx.prototype._merge = function (table, base) {
    var idc = this.idCol(table), p = this._p(table), e = p[String(base[idc])];
    if (!e) return base;
    if (e.deleted) return null;
    return e.row;
  };
  Trx.prototype.get = function (table, id) {
    table = table.toLowerCase();
    var idc = this.idCol(table), p = this._p(table), e = p[String(id)];
    if (e) return e.deleted ? null : e.row;
    if (isNewId(id) || id == null) return null;
    var r = this.q('SELECT * FROM ' + table + ' WHERE ' + idc + '=?', [id])[0];
    return r || null;
  };
  // find(table, where{col:val}, orderBy[]) — base rows (host reader) overlaid with this Trx's pending writes.
  Trx.prototype.find = function (table, where, orderBy) {
    table = table.toLowerCase(); where = where || {};
    var cols = Object.keys(where), self = this, idc = this.idCol(table), seen = {}, out = [];
    var base = [];
    var anyNew = cols.some(function (c) { return isNewId(where[c]); });
    if (!anyNew) {
      var sql = 'SELECT * FROM ' + table + (cols.length ? ' WHERE ' + cols.map(function (c) { return where[c] == null ? c + ' IS NULL' : c + '=?'; }).join(' AND ') : '');
      try { base = this.q(sql, cols.filter(function (c) { return where[c] != null; }).map(function (c) { return where[c]; })); } catch (e) { base = []; }
    }
    base.forEach(function (b) { seen[String(b[idc])] = 1; var m = self._merge(table, b); if (m && match(m)) out.push(m); });
    var p = this._p(table);
    Object.keys(p).forEach(function (k) { var e = p[k]; if (seen[k] || e.deleted) return; if (match(e.row)) out.push(e.row); });
    function match(r) { return cols.every(function (c) { return same(r[c], where[c]); }); }
    if (orderBy && orderBy.length) out.sort(function (a, b) {
      for (var i = 0; i < orderBy.length; i++) { var c = orderBy[i], x = a[c], y = b[c];
        var nx = Number(x), ny = Number(y), d = (!isNaN(nx) && !isNaN(ny)) ? nx - ny : String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0;
        if (d) return d; }
      return 0;
    });
    return out;
  };
  // insert — PO.saveNew. Returns the live row; its key is '#new:i' until commit resolves {__opRef:i}.
  Trx.prototype.insert = function (table, fields) {
    table = table.toLowerCase();
    var idc = this.idCol(table), row = {};
    for (var k in fields) if (Object.prototype.hasOwnProperty.call(fields, k)) row[k.toLowerCase()] = fields[k];
    var opIdx = this.ops.length, id = NEW + opIdx;
    // a key that is the dictionary's IsKey column gets the new-row placeholder (PO.saveNew assigns it); a table keyed only by its IsParent
    // column (C_AcctSchema_GL / _Default: key = C_AcctSchema_ID) KEEPS the parent id the caller gave (§MODEL-INSERT-KEEPKEY) unless that identity is taken in this Trx.
    var givenParent = this.keyCols(table).length === 1 && row[idc] != null && !isRealKey(this.q, table, idc) && !this._p(table)[String(row[idc])];
    if (givenParent) { /* keep row[idc] */ }
    else if (this.keyCols(table).length === 1) row[idc] = id;
    else { if (row[idc] == null) row[idc] = this.env.uuid ? this.env.uuid() : id; }
    // PO.saveNew omits null columns, so the physical column DEFAULT applies (data: ad_ddl_default, extracted from the
    // reference schema by erp/patches/build_ad_seed_patch.sh — never guessed).
    var dd = ddlDefaults(this, table);
    Object.keys(dd).forEach(function (c) { if (row[c] == null) row[c] = dd[c]; });
    if (row.ad_client_id == null && this.env.client != null) row.ad_client_id = this.env.client;
    if (row.isactive == null) row.isactive = 'Y';
    this.ops.push({ op_type: 'CRUD_CREATE', key: table, table: table, verb: 'create', id: null, cas: null, fields: row, stdDefaults: this.env.std || null });
    this._p(table)[String(row[idc])] = { row: row, orig: null, isNew: true, opIdx: opIdx };
    return row;
  };
  // update — PO.saveUpdate of the changed columns. Coalesces per row: ONE CRUD_UPDATE at the first write, old = the
  // value before this Trx, new = the final value (what a commit of one trxName leaves behind).
  Trx.prototype.update = function (table, row, changes) {
    table = table.toLowerCase();
    var idc = this.idCol(table), key = String(row[idc]), p = this._p(table), e = p[key];
    if (!e) { e = p[key] = { row: Object.assign({}, row), orig: Object.assign({}, row), isNew: false, opIdx: null }; }
    var real = {};
    for (var c in changes) if (Object.prototype.hasOwnProperty.call(changes, c)) {
      var col = c.toLowerCase(), v = changes[c];
      if (v instanceof BigDecimal) v = N(v);
      if (!same(e.row[col], v) || (e.row[col] == null) !== (v == null)) real[col] = v;
      e.row[col] = v;
    }
    Object.keys(real).forEach(function (col) { row[col] = real[col]; });
    if (!Object.keys(real).length) return e.row;
    if (e.isNew) { Object.assign(this.ops[e.opIdx].fields, real); return e.row; }
    if (e.opIdx == null) { e.opIdx = this.ops.length; this.ops.push({ op_type: 'CRUD_UPDATE', key: table, table: table, verb: 'update', id: row[idc], idCol: idc === table + '_id' ? undefined : idc, changes: {} }); }
    var ch = this.ops[e.opIdx].changes;
    Object.keys(real).forEach(function (col) {
      // a column that returns to its pre-Trx value is no change at all: drop it from the op; an op left empty is dropped (§MODEL-TRX-NET)
      if (same(e.orig[col], real[col]) && (e.orig[col] == null) === (real[col] == null)) delete ch[col];
      else ch[col] = { old: e.orig[col] == null ? null : e.orig[col], new: real[col] };
    });
    if (!Object.keys(ch).length) { this.ops[e.opIdx] = null; e.opIdx = null; this.say('§MODEL-TRX-NET ' + table + ' ' + key + ' update nets to no-op — op dropped'); }
    return e.row;
  };
  Trx.prototype.del = function (table, row) {
    table = table.toLowerCase();
    var idc = this.idCol(table), key = String(row[idc]), p = this._p(table), e = p[key];
    if (e && e.isNew) { this.ops[e.opIdx] = null; e.deleted = true; return; }       // created+deleted in one trx = nothing
    if (e && e.opIdx != null) this.ops[e.opIdx] = null;
    p[key] = { row: row, orig: row, isNew: false, opIdx: this.ops.length, deleted: true };
    this.ops.push({ op_type: 'CRUD_DELETE', key: table, table: table, verb: 'delete', id: row[idc], idCol: idc === table + '_id' ? undefined : idc, tombstone: true, reversible: true });
  };
  Trx.prototype.say = function (line) { this.log.push(line); };
  // groupOps — the final group: drop nulls, renumber, turn '#new:i' into {__opRef:<final index>}.
  Trx.prototype.groupOps = function () {
    var map = {}, out = [];
    this.ops.forEach(function (o, i) { if (o) { map[i] = out.length; out.push(o); } });
    function fix(v) { if (isNewId(v)) { var i = Number(v.slice(NEW.length)); return { __opRef: map[i] }; } return v; }
    var tail = [];
    var res = out.map(function (o, oi) {
      var c = JSON.parse(JSON.stringify(o));
      // a CREATE whose FK points at a row created LATER in the group (invoice.C_Payment_ID ← the payment its own
      // completeIt makes) cannot be resolved in apply order → write it as a trailing UPDATE of the created row.
      if (c.fields) Object.keys(c.fields).forEach(function (k) {
        var f = fix(c.fields[k]);
        if (f && typeof f === 'object' && f.__opRef === oi) { delete c.fields[k]; return; }   // its own key: the host assigns it (listTip -opId)
        if (f && typeof f === 'object' && f.__opRef != null && f.__opRef > oi) { delete c.fields[k]; tail.push({ op_type: 'CRUD_UPDATE', key: c.table, table: c.table, verb: 'update', id: { __opRef: oi }, changes: (function () { var ch = {}; ch[k] = { old: null, new: f }; return ch; })() }); }
        else c.fields[k] = f;
      });
      if (c.changes) Object.keys(c.changes).forEach(function (k) {
        var f = fix(c.changes[k].new);
        if (f && typeof f === 'object' && f.__opRef != null && f.__opRef > oi) { var ch = {}; ch[k] = { old: c.changes[k].old, new: f }; delete c.changes[k];
          tail.push({ op_type: 'CRUD_UPDATE', key: c.table, table: c.table, verb: 'update', id: c.id, idCol: c.idCol, changes: ch }); }
        else c.changes[k].new = f;
      });
      if (isNewId(c.id)) c.id = fix(c.id);
      return c;
    });
    return res.concat(tail);
  };

  // newPO(trx, table, fields) — `new X(ctx,0,trx)`: PO.setStandardDefaults (PO.java:1973-2001: Processed/Processing/
  // Posted='N' only where the table HAS the column, IsActive='Y', client/org). The generated X_<Table>(ctx,0) ctor bodies are
  // COMMENTED OUT in this iDempiere (X_C_Order.java:43 `/** if (C_Order_ID == 0) {…} */`), so AD_Column.DefaultValue is NOT stamped here (that is
  // GridTab.dataNew / getDefault, ad_callout.js); the M class ctor's setInitialDefaults come from MODEL[table].initialDefaults, and the physical column DEFAULTs
  // (ad_ddl_default) apply at Trx.insert. (§MODEL-NEWPO-JAVA — deleted the AD-mandatory-default stamping that Java does not do.)
  function newPO(trx, table, fields) {
    table = table.toLowerCase();
    var row = {}, env = trx.env;
    // the M class ctor's setInitialDefaults (registered as MODEL[table].initialDefaults — clock-valued ones are left to the caller)
    var M = MODEL[table]; if (M && M.initialDefaults) Object.keys(M.initialDefaults).forEach(function (c) { row[c] = M.initialDefaults[c]; });
    var cols0 = columnsOf(trx, table);   // only the columns the table has (C_InvoiceLine/C_InvoiceTax carry no Posted/Processing)
    ['processed', 'processing', 'posted'].forEach(function (c) { if (cols0[c]) row[c] = 'N'; });
    row.isactive = 'Y';
    if (env.client != null) row.ad_client_id = env.client;
    if (env.org != null) row.ad_org_id = env.org;
    for (var k in fields) if (Object.prototype.hasOwnProperty.call(fields, k)) row[k.toLowerCase()] = fields[k];
    return row;
  }

  // ══ PO.copyValues(from, to, AD_Client_ID, AD_Org_ID) (PO.java:1431-1485) — every AD_Column of the table that is not virtual,
  // key, UUID, standard (AD_Client/AD_Org/IsActive/Processing/Created*/Updated*; MColumn.java:277-291) and IsAllowCopy='Y'
  var STD = /^(ad_client_id|ad_org_id|isactive|processing|created|createdby|updated|updatedby)$/, _cc = {};
  function copyCols(trx, table) {
    if (_cc[table]) return _cc[table];
    var out = [];
    trx.q("SELECT lower(c.columnname) AS c, c.iskey AS k, c.isallowcopy AS ac, c.columnsql AS s FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=? AND c.isactive='Y'", [table])
      .forEach(function (r) {
        if ((r.s != null && r.s !== '') || r.k === 'Y' || r.c === table + '_uu' || STD.test(r.c) || r.ac !== 'Y') return;
        out.push(r.c);
      });
    return (_cc[table] = out);
  }
  function copyValues(trx, table, from, to, client, org) {
    var f = from.row || from;
    copyCols(trx, table).forEach(function (c) { if (Object.prototype.hasOwnProperty.call(f, c)) to.set(c, f[c]); });
    to.set('ad_client_id', client); to.set('ad_org_id', org);
  }

  // ══ PO — a record handle (Java PO): pending changes over the live row; save() = PO.save through save() below
  // (beforeSave → validators → saveNew/DocumentNo → afterSave), saveEx throws. A new handle starts from newPO (ctor defaults).
  function PO(trx, table, row, fields) { this.trx = trx; this.table = String(table).toLowerCase(); this.row = row || null; this.ch = fields ? Object.assign({}, fields) : {}; this.p = {}; }
  PO.prototype.get = function (c) { c = c.toLowerCase(); return Object.prototype.hasOwnProperty.call(this.ch, c) ? this.ch[c] : (this.row ? this.row[c] : null); };
  PO.prototype.set = function (c, v) { this.ch[c.toLowerCase()] = v instanceof BigDecimal ? N(v) : v; return this; };
  PO.prototype.id = function () { return this.row ? this.row[this.trx.idCol(this.table)] : null; };
  PO.prototype.is_new = function () { return !this.row; };
  PO.prototype.values = function () { return Object.assign({}, this.row || {}, this.ch); };
  PO.prototype.save = function () {
    var r = save(this.trx, this.table, this.row, this.ch);
    if (!r.ok) { this.trx.say('§MODEL-PO save ' + this.table + ' refused: ' + r.error); this.error = r.error; return false; }
    this.row = r.row; this.ch = {}; return true;
  };
  PO.prototype.saveEx = function () { if (!this.save()) throw new Error('SaveError ' + this.table + ': ' + this.error); return this; };
  PO.prototype.load = function () { if (this.row) this.row = this.trx.get(this.table, this.id()) || this.row; return this; };
  PO.prototype.deleteEx = function () { var r = remove(this.trx, this.table, this.row); if (!r.ok) throw new Error('DeleteError ' + this.table + ': ' + r.error); };
  function po(trx, table, rowOrId) { if (rowOrId == null) return null; var r = typeof rowOrId === 'object' ? rowOrId : trx.get(table, rowOrId); return r ? new PO(trx, table, r) : null; }
  function newRecord(trx, table, fields) { return new PO(trx, table, null, newPO(trx, table, fields || {})); }

  // PO.saveEx on a plain row + changes map: save(), THROWING AdempiereException(error) like Java saveEx (was processes/support_pay.js saveRow)
  function saveEx(trx, table, row, changes) { var r = save(trx, table, row, changes); if (!r.ok) throw new Error(r.error || 'SaveError'); return r.row; }

  // ══ the model registry — ONE: ad_modelval.js. Model classes (afterSave etc.) + validators share it ══════════
  var MODEL = {};   // table -> { beforeSave(trx,row,isNew,old), afterSave(trx,row,isNew,old), afterDelete(trx,row) } — the M*.java overrides
  function registerModel(table, impl) { MODEL[table.toLowerCase()] = Object.assign(MODEL[table.toLowerCase()] || {}, impl); }
  function fire(trx, timing, table, row, extra) {
    if (!MV || typeof MV.fireHooks !== 'function') return null;
    var r = MV.fireHooks(timing, Object.assign({ table: table, record: row }, extra || {}), Object.assign({ trx: trx }, trx.env.ctx || {}));
    return r && !r.ok ? (r.error || ('blocked by ' + r.blocked)) : null;
  }
  // save — PO.save (PO.java saveNew/saveUpdate): beforeSave → validators → write → afterSave → validators.
  function save(trx, table, row, changes) {
    table = table.toLowerCase();
    var isNew = row == null, M = MODEL[table] || {}, old = isNew ? null : Object.assign({}, row);
    var rec = isNew ? Object.assign({}, changes) : Object.assign({}, row, changes);
    if (!isNew && !Object.keys(changes || {}).some(function (k) { var a = row[k], b = changes[k]; return !same(a, b) || (a == null) !== (b == null); })) return { ok: true, row: row };   // PO.save :2425 — !newRecord && !is_Changed() → true, no hooks
    if (M.beforeSave) { var e0 = M.beforeSave(trx, rec, isNew, old); if (e0) return { ok: false, error: e0 }; }
    var e1 = fire(trx, isNew ? 'BEFORE_NEW' : 'BEFORE_CHANGE', table, rec, { recordOld: old }) || fire(trx, 'BEFORE_SAVE', table, rec, { recordOld: old });
    if (e1) return { ok: false, error: e1 };
    var live;
    if (isNew) { saveNewNumbers(trx, table, rec); live = trx.insert(table, rec); }
    else { var ch = {}; for (var k in rec) if (!same(rec[k], row[k]) || (rec[k] == null) !== (row[k] == null)) ch[k] = rec[k]; live = trx.update(table, row, ch); }
    if (M.afterSave) { var e2 = M.afterSave(trx, live, isNew, old); if (e2) return { ok: false, error: e2 }; }
    var e3 = fire(trx, isNew ? 'AFTER_NEW' : 'AFTER_CHANGE', table, live, { recordOld: old }) || fire(trx, 'AFTER_SAVE', table, live, { recordOld: old });
    if (e3) return { ok: false, error: e3 };
    return { ok: true, row: live };
  }
  // PO.saveNew :3563-3605 — a new row's DocumentNo ('<…>' = a preview → empty) from C_DocTypeTarget_ID when the table has that
  // column else C_DocType_ID (MSequence by doctype, may return null), else the table's DocumentNo_<Table> sequence; an empty
  // Value likewise from the table sequence (not for M_AttributeInstance / AD_TableAttribute / AD_SysConfig / T_*).
  var _cols = {}, _alloc = null;
  function setDocNoAllocator(a) { _alloc = a; }
  function columnsOf(trx, table) {
    if (_cols[table]) return _cols[table];
    var o = {}, tn = null;
    try { trx.q("SELECT c.columnname AS c, t.tablename AS t, c.columnsql AS s FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=? AND c.isactive='Y'", [table])
      .forEach(function (r) { o[String(r.c).toLowerCase()] = { name: r.c, virtual: r.s != null && r.s !== '' }; tn = r.t; }); } catch (e) {}
    o.__tableName = tn || table;
    return (_cols[table] = o);
  }
  function saveNewNumbers(trx, table, rec) {
    if (!_alloc || /^t_/.test(table)) return;
    var cols = columnsOf(trx, table), tn = cols.__tableName;
    if (cols.documentno) {
      var value = rec.documentno == null ? null : String(rec.documentno);
      if (value != null && /^<.*>$/.test(value)) value = null;
      if (value == null || value.length === 0) {
        var dtc = cols.c_doctypetarget_id ? 'c_doctypetarget_id' : cols.c_doctype_id ? 'c_doctype_id' : null;
        if (dtc) value = _alloc.byDocType(trx, Number(rec[dtc] || 0), false, rec);
        if (value == null) value = _alloc.byTable(trx, tn, rec);
        rec.documentno = value;
      }
    }
    if (!/^(m_attributeinstance|ad_tableattribute|ad_sysconfig)$/.test(table) && cols.value && !cols.value.virtual) {
      if (rec.value == null || String(rec.value).length === 0) rec.value = _alloc.byTable(trx, tn, rec);
    }
  }
  function remove(trx, table, row) {
    table = table.toLowerCase();
    var M = MODEL[table] || {};
    if (M.beforeDelete) { var e0 = M.beforeDelete(trx, row); if (e0) return { ok: false, error: e0 }; }   // PO.delete → beforeDelete (model) before the validators
    var e1 = fire(trx, 'BEFORE_DELETE', table, row); if (e1) return { ok: false, error: e1 };
    trx.del(table, row);
    if (M.afterDelete) { var e2 = M.afterDelete(trx, row); if (e2) return { ok: false, error: e2 }; }
    var e3 = fire(trx, 'AFTER_DELETE', table, row); if (e3) return { ok: false, error: e3 };
    return { ok: true };
  }

  // ══ DocAction — the extension point ══════════════════════════════════════════════════════════════════════
  // registerDocAction(table, impl): impl is the DocAction class — { prepareIt, completeIt, approveIt, voidIt, closeIt,
  // reverseCorrectIt, reverseAccrualIt, reActivateIt, getSummary } each fn(trx, doc) → status string (prepare/complete)
  // or boolean. A plugin bundle calls this through PluginRegistry ctx.docAction — no host code per table.
  var DOCS = {}, _poster = null;
  function setPoster(fn) { _poster = fn; }
  function registerDocAction(table, impl) { DOCS[table.toLowerCase()] = impl; return Object.keys(DOCS).length; }
  function docActionFor(table) { return DOCS[(table || '').toLowerCase()] || null; }

  // DocumentEngine.processIt(action) — process/DocumentEngine.java:301-360 + prepareIt :489-498 + completeIt.
  // The document's DocStatus is written by the ENGINE (setDocStatus after each step), DocAction by the class.
  function processIt(trx, table, id, action) {
    table = table.toLowerCase();
    var impl = DOCS[table], doc = trx.get(table, id);
    if (!impl) return { ok: false, status: doc && doc.docstatus, msg: 'no DocAction class registered for ' + table };
    if (!doc) return { ok: false, status: null, msg: table + ' ' + id + ' not found' };
    trx._msg = null;
    function setStatus(s) { trx.update(table, doc, { docstatus: s }); }
    var st = doc.docstatus;
    if (action === 'PR') { var p = impl.prepareIt(trx, doc); setStatus(p); return { ok: p === 'IP', status: p, msg: trx._msg }; }
    if (action === 'CO' || action === 'WC') {
      if (st === 'DR' || st === 'IN' || st == null) {                     // :325-330 prepare if not prepared yet
        var ps = impl.prepareIt(trx, doc); setStatus(ps);
        if (ps !== 'IP') return { ok: false, status: ps, msg: trx._msg };
      }
      var outer = trx._docsPost; trx._docsPost = [];                       // this document's IDocsPostProcess list
      var cs = impl.completeIt(trx, doc); setStatus(cs);
      var docsPost = trx._docsPost; trx._docsPost = outer;
      var ok = cs === 'CO' || cs === 'IP' || cs === 'WP' || cs === 'WC';  // :330-333
      if (ok && docsPost.length) docsPost.forEach(function (d) {          // :335-346 docafter.setProcessedOn("Processed") + saveEx
        var r = trx.get(d.table, d.id); if (r && trx.env.nowMillis != null) save(trx, d.table, r, { processedon: trx.env.nowMillis + (trx._procSeq = (trx._procSeq || 0) + 1) / 1000 }   /* monotonic within the recorded clock (PO.setProcessedOn :1108-1138) */); });
      // :349-372 MClient.isClientAccountingImmediate → postIt (env.postImmediate overrides; env.noPost = accounting queued), then each
      // queued docafter whose OWN instance says Posted<>'Y' → DocumentEngine.postImmediate(…, force=true) = a repost
      if (ok && cs === 'CO' && !trx.env.noPost) { var P = typeof trx.env.postImmediate === 'function' ? trx.env.postImmediate : _poster;
        if (P) { P(trx, table, trx.get(table, id));
          docsPost.forEach(function (d) { if (d.posted === 'Y') return; var r = trx.get(d.table, d.id); if (r) P(trx, d.table, r, { repost: true }); }); } }
      return { ok: ok, status: cs, msg: trx._msg };
    }
    var m = { AP: 'approveIt', RJ: 'rejectIt', VO: 'voidIt', CL: 'closeIt', RC: 'reverseCorrectIt', RA: 'reverseAccrualIt', RE: 'reActivateIt' }[action];
    if (!m || typeof impl[m] !== 'function') return { ok: false, status: st, msg: 'DocAction ' + action + ' not implemented by the ' + table + ' class (named, not faked)' };
    var res = impl[m](trx, doc);
    return { ok: !!res, status: trx.get(table, id).docstatus, msg: trx._msg };
  }

  // ══ Workflow — the path the UI takes (AbstractADWindowContent:3766 → ServerProcessCtl:220 startWorkflow) ═══
  // The DocAction column's AD_Process carries AD_Workflow_ID (Process_Order 116 etc.); MWFProcess walks the nodes
  // (Start Z → DocPrepare D/PR → DocComplete D/CO for a user's Complete, via MWFNodeNext.isValidFor :213-260) and
  // each D-node calls doc.processIt(node.DocAction) (MWFActivity.performWork :1095-1153). Rows: AD_WF_Process (one),
  // AD_WF_Activity + AD_WF_EventAudit per node (MWFActivity.run :938-973, updateEventAudit :354-376).
  function workflowOf(trx, table) {
    try {
      var r = trx.q("SELECT p.ad_workflow_id AS w FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id JOIN ad_process p ON p.ad_process_id=c.ad_process_id WHERE lower(t.tablename)=? AND lower(c.columnname)='docaction'", [table])[0];
      if (!r || !r.w) return null;
      var w = trx.q('SELECT * FROM ad_workflow WHERE ad_workflow_id=?', [r.w])[0];
      return w || null;
    } catch (e) { return null; }
  }
  function tableIdOf(trx, table) {
    var r = trx.q('SELECT ad_table_id AS id FROM ad_table WHERE lower(tablename)=?', [table])[0];
    return r ? r.id : null;
  }
  function runWorkflow(trx, table, id, action) {
    table = table.toLowerCase();
    var wf = workflowOf(trx, table), doc = trx.get(table, id), impl = DOCS[table];
    if (doc && action) trx.update(table, doc, { docaction: action });   // the user's selection is saved first
    if (!wf) { trx.say('§MODEL-WF table=' + table + ' workflow=absent → direct DocumentEngine.processIt'); return processIt(trx, table, id, action); }
    var env = trx.env, tid = tableIdOf(trx, table);
    var resp = wf.ad_wf_responsible_id != null ? wf.ad_wf_responsible_id : null;
    var proc = trx.insert('ad_wf_process', { ad_org_id: doc.ad_org_id, ad_workflow_id: wf.ad_workflow_id, ad_wf_responsible_id: resp,
      ad_user_id: env.user != null ? env.user : null, wfstate: 'OR', processing: 'N', processed: 'N', ad_table_id: tid, record_id: id, priority: wf.priority != null ? wf.priority : 0 });
    var cur = wf.ad_wf_node_id, steps = 0, res = { ok: true, status: doc.docstatus }, path = [], abort = null;
    while (cur != null && steps++ < 50) {
      var node = trx.q('SELECT * FROM ad_wf_node WHERE ad_wf_node_id=?', [cur])[0];
      if (!node) { abort = 'node-missing:' + cur; break; }
      path.push(cur);
      var act = trx.insert('ad_wf_activity', { ad_org_id: doc.ad_org_id, ad_wf_process_id: proc.ad_wf_process_id, ad_wf_node_id: cur, ad_workflow_id: wf.ad_workflow_id,
        ad_wf_responsible_id: node.ad_wf_responsible_id != null ? node.ad_wf_responsible_id : resp, ad_user_id: env.user != null ? env.user : null,
        wfstate: 'OR', processing: 'N', processed: 'N', ad_table_id: tid, record_id: id, priority: node.priority != null ? node.priority : 0 });
      var text = null;
      if (node.action === 'D') {
        var da = (node.docaction && node.docaction !== '--') ? node.docaction : trx.get(table, id).docaction;   // DocAuto = the doc's own
        res = processIt(trx, table, id, da);
        text = impl && impl.getSummary ? impl.getSummary(trx, trx.get(table, id)) : null;
        if (!res.ok) { abort = res.msg || ('DocAction ' + da + ' failed'); trx.update('ad_wf_activity', act, { wfstate: 'CA', processed: 'Y', textmsg: abort }); break; }
      } else if (node.action !== 'Z') { abort = 'node action ' + node.action + ' not modeled (named, MWFActivity.performWork)'; break; }
      trx.update('ad_wf_activity', act, { wfstate: 'CC', processed: 'Y', textmsg: text });
      trx.insert('ad_wf_eventaudit', { ad_org_id: doc.ad_org_id, ad_wf_process_id: proc.ad_wf_process_id, ad_wf_node_id: cur, ad_table_id: tid, record_id: id,
        ad_wf_responsible_id: act.ad_wf_responsible_id, ad_user_id: act.ad_user_id, eventtype: 'PX', wfstate: 'CC', textmsg: text, elapsedtimems: 0 });
      // MWFProcess.startNext :402-445 — ordered transitions, the FIRST valid; std-user gate MWFNodeNext.isValidFor :213-260
      var d = trx.get(table, id), nexts = trx.q("SELECT * FROM ad_wf_nodenext WHERE ad_wf_node_id=? AND isactive='Y' ORDER BY seqno", [cur]), nxt = null;
      for (var i = 0; i < nexts.length; i++) {
        var nn = nexts[i];
        if (nn.isstduserworkflow === 'Y' && !(d.docaction === 'CO' && !/^(CO|WC|WP|VO|CL|RE)$/.test(d.docstatus || ''))) continue;
        nxt = nn.ad_wf_next_id; break;
      }
      cur = nxt;
    }
    var pstate = abort ? 'CA' : 'CC';
    trx.update('ad_wf_process', proc, { wfstate: pstate, processed: 'Y', textmsg: abort || (impl && impl.getSummary ? impl.getSummary(trx, trx.get(table, id)) : null) });
    trx.say('§MODEL-WF table=' + table + ' id=' + id + ' workflow=' + wf.ad_workflow_id + ' path=' + path.join('>') + ' state=' + pstate + (abort ? ' abort="' + abort + '"' : ''));
    return Object.assign({}, res, { ok: !abort && res.ok, workflow: wf.ad_workflow_id, path: path });
  }

  // ══ the single host entry (prompts/ERP_MODEL_LAYER.md §Seams) ═══════════════════════════════════════════
  // run(query, env, spec) → { ok, ops, log, status, msg }. spec = { table, timing:'DOCACTION'|'AFTER_SAVE'|…, id, action,
  // record, old }. The caller appends `ops` to the SAME group it is about to seal.
  function run(query, env, spec) {
    var trx = new Trx(query, env), table = String(spec.table || '').toLowerCase(), r;
    try {
      if (spec.timing === 'DOCACTION') r = env && env.noWorkflow ? processIt(trx, table, spec.id, spec.action) : runWorkflow(trx, table, spec.id, spec.action);
      else if (spec.timing === 'SAVE') r = save(trx, table, spec.id != null ? trx.get(table, spec.id) : null, spec.changes || {});
      else if (spec.timing === 'AFTER_SAVE') {
        // the host has ALREADY written the record (its own CRUD op in the same group): make it visible to the Trx
        // without re-emitting it, then run PO.afterSave + the AFTER_NEW|CHANGE validators exactly as save() would.
        var rec = {}; for (var rk in spec.record) rec[rk.toLowerCase()] = spec.record[rk];
        trx._p(table)[String(rec[trx.idCol(table)])] = { row: rec, orig: Object.assign({}, rec), isNew: false, opIdx: null };
        var M = MODEL[table] || {}, e = M.afterSave ? M.afterSave(trx, rec, !!spec.isNew, spec.old || null) : null;
        if (!e) e = fire(trx, spec.isNew ? 'AFTER_NEW' : 'AFTER_CHANGE', table, rec, { recordOld: spec.old || null }) || fire(trx, 'AFTER_SAVE', table, rec, { recordOld: spec.old || null });
        r = { ok: !e, error: e };
      }
      else if (spec.timing === 'BEFORE_SAVE') {   // PO.beforeSave derivations for a record the HOST will write: returns the derived columns, no ops
        var rec2 = {}; for (var k2 in spec.record) rec2[k2.toLowerCase()] = spec.record[k2];
        var M2 = MODEL[table] || {}, before = Object.assign({}, rec2);
        // a NEW record from a window is `new MX(ctx,0)` first: the class's setInitialDefaults fill what the form left empty
        if (spec.isNew && M2.initialDefaults) Object.keys(M2.initialDefaults).forEach(function (c) { if (rec2[c] == null || rec2[c] === '') rec2[c] = M2.initialDefaults[c]; });
        var e2 = M2.beforeSave ? M2.beforeSave(trx, rec2, !!spec.isNew, spec.old || null) : null;
        if (!e2) e2 = fire(trx, spec.isNew ? 'BEFORE_NEW' : 'BEFORE_CHANGE', table, rec2, { recordOld: spec.old || null });
        var derived = {}; Object.keys(rec2).forEach(function (c) { if (String(rec2[c]) !== String(before[c])) derived[c] = rec2[c]; });
        r = { ok: !e2, error: e2, derived: derived };
      }
      else r = { ok: false, msg: 'unknown timing ' + spec.timing };
    } catch (ex) { r = { ok: false, msg: 'model threw: ' + (ex && ex.message) }; trx.say('§MODEL-ERR ' + (ex && ex.stack || ex)); }
    var ops = r && r.ok !== false ? trx.groupOps() : [];
    return Object.assign({ ok: r.ok !== false, ops: ops, log: trx.log, trx: trx }, r, { ops: ops });
  }

  return { PO: PO, po: po, newRecord: newRecord, setDocNoAllocator: setDocNoAllocator, columnsOf: columnsOf, setPoster: setPoster, MV: MV, Trx: Trx, D: D, N: N, isNewId: isNewId, keyColsOf: keyColsOf, newPO: newPO, copyValues: copyValues, saveEx: saveEx, registerModel: registerModel, MODEL: MODEL, fire: fire,
           save: save, remove: remove, registerDocAction: registerDocAction, docActionFor: docActionFor, DOCS: DOCS,
           processIt: processIt, runWorkflow: runWorkflow, workflowOf: workflowOf, tableIdOf: tableIdOf, run: run };
});
