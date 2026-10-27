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
    api = factory(require('./bigdecimal'), require('./ad_modelval'), (function () { try { return require('./ad_workflow'); } catch (e) { return null; } })(), require('./layered_registry'));
    module.exports = api;
  } else {
    api = factory(root.BigDecimal, root.AdModelVal, root.AdWorkflow, root.LayeredRegistry);
    root.ModelLayer = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (BigDecimal, MV, WF, LR) {

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
  // Trx.setSavepoint / rollback(savepoint) (DocManager.postDocument :390-470 posts every schema under one savepoint and rolls it back on an error): a deep copy of the
  // group + the pending overlay (they share row objects, so they are copied TOGETHER); callers re-read their row objects after a rollback.
  Trx.prototype.setSavepoint = function () {
    var snap = { ops: this.ops, pend: this.pend, n: this._newSeq, obs: (this._observed || []).length };
    try { return structuredClone(snap); } catch (e) { return JSON.parse(JSON.stringify(snap)); }
  };
  Trx.prototype.rollbackTo = function (sp) { this.ops = sp.ops; this.pend = sp.pend; this._newSeq = sp.n; if (this._observed) this._observed.length = Math.min(this._observed.length, sp.obs || 0); };   // observers queued after the savepoint are dropped with its writes
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
  Trx.prototype.insert = function (table, fields, opts) {
    table = table.toLowerCase();
    var idc = this.idCol(table), row = {};
    for (var k in fields) if (Object.prototype.hasOwnProperty.call(fields, k)) row[k.toLowerCase()] = fields[k];
    var opIdx = this.ops.length, id = NEW + opIdx;
    // a key that is the dictionary's IsKey column gets the new-row placeholder (PO.saveNew assigns it); a table keyed only by its IsParent
    // column (C_AcctSchema_GL / _Default: key = C_AcctSchema_ID) KEEPS the parent id the caller gave (§MODEL-INSERT-KEEPKEY) unless that identity is taken in this Trx.
    var givenParent = this.keyCols(table).length === 1 && row[idc] != null && !isRealKey(this.q, table, idc) && !this._p(table)[String(row[idc])];
    // PO.saveNew :3530-3535 - a REPLICA keeps the key it was sent (`if (isReplication() && get_ID() > 0) no = get_ID()`): opts.keepKey, a real (non-placeholder) positive key not yet taken in this Trx
    var keepRecv = !!(opts && opts.keepKey) && this.keyCols(table).length === 1 && row[idc] != null && !isNewId(row[idc]) && Number(row[idc]) > 0 && !this._p(table)[String(row[idc])];
    if (givenParent || keepRecv) { /* keep row[idc] */ }
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
    // a '#new:i' INSIDE a longer text (a Doc.post AD_Note Reference "MInOut[<id>-<docno>,...]") becomes the token {{opref:<final index>}}, which the host
    // (crud_overlay._resolveOpRefs) replaces with the pk that op gets - the same id law as the {__opRef} FKs.
    function fix(v) { if (isNewId(v)) { var i = Number(v.slice(NEW.length)); return { __opRef: map[i] }; }
      if (typeof v === 'string' && v.indexOf(NEW) > 0) return v.replace(/#new:(\d+)/g, function (m, d) { return map[Number(d)] == null ? m : '{{opref:' + map[Number(d)] + '}}'; });
      return v; }
    this._opMap = map;                       // Trx op index -> final group index: the observers' key resolution after commit (MV.deliverObserved)
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
    if (M && M.initialClock) M.initialClock.forEach(function (c) { row[c] = trx.env.date; });   // the ctor's new Timestamp(System.currentTimeMillis()) defaults (ERP_WS_API.md S2: a WS-created order)
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
  function PO(trx, table, row, fields) { this.trx = trx; this.table = String(table).toLowerCase(); this.row = row || null; this.ch = fields ? Object.assign({}, fields) : {}; this.p = {}; this.m_isReplication = false; }
  PO.prototype.get = function (c) { c = c.toLowerCase(); return Object.prototype.hasOwnProperty.call(this.ch, c) ? this.ch[c] : (this.row ? this.row[c] : null); };
  PO.prototype.set = function (c, v) { this.ch[c.toLowerCase()] = v instanceof BigDecimal ? N(v) : v; return this; };
  PO.prototype.id = function () { return this.row ? this.row[this.trx.idCol(this.table)] : null; };
  PO.prototype.is_new = function () { return !this.row; };
  PO.prototype.values = function () { return Object.assign({}, this.row || {}, this.ch); };
  // PO.setReplication / isReplication / saveReplica (PO.java:2968-2973, :5810-5821): the flag applies to ONE save (reset after it, :2789), saveReplica = setReplication(true) + saveEx()
  PO.prototype.setReplication = function (b) { this.m_isReplication = !!b; return this; };
  PO.prototype.isReplication = function () { return this.m_isReplication; };
  PO.prototype.saveReplica = function (isFromReplication) { this.m_isReplication = isFromReplication == null ? true : !!isFromReplication; return this.saveEx(); };
  PO.prototype.save = function () {
    var repl = this.m_isReplication; this.m_isReplication = false;
    var r = save(this.trx, this.table, this.row, this.ch, repl ? { isReplication: true } : null);
    if (!r.ok) { this.trx.say('§MODEL-PO save ' + this.table + ' refused: ' + r.error); this.error = r.error; return false; }
    this.row = r.row; this.ch = {}; return true;
  };
  PO.prototype.saveEx = function () { if (!this.save()) throw new Error('SaveError ' + this.table + ': ' + this.error); return this; };
  PO.prototype.load = function () { if (this.row) this.row = this.trx.get(this.table, this.id()) || this.row; return this; };
  PO.prototype.deleteEx = function () { var repl = this.m_isReplication; this.m_isReplication = false; var r = remove(this.trx, this.table, this.row, repl ? { isReplication: true } : null); if (!r.ok) throw new Error('DeleteError ' + this.table + ': ' + r.error); };
  function po(trx, table, rowOrId) { if (rowOrId == null) return null; var r = typeof rowOrId === 'object' ? rowOrId : trx.get(table, rowOrId); return r ? new PO(trx, table, r) : null; }
  function newRecord(trx, table, fields) { return new PO(trx, table, null, newPO(trx, table, fields || {})); }

  // PO.saveEx on a plain row + changes map: save(), THROWING AdempiereException(error) like Java saveEx (was processes/support_pay.js saveRow)
  function saveEx(trx, table, row, changes) { var r = save(trx, table, row, changes); if (!r.ok) throw new Error(r.error || 'SaveError'); return r.row; }

  // ══ the model registry — ONE: ad_modelval.js. Model classes (afterSave etc.) + validators share it ══════════
  // LAYERED (Host work H1, layered_registry.js): the core classes are layer 'core'/rank 0; a plugin bundle registers with {owner, rank:1} like an OSGi IModelFactory (service.ranking) and stopping it removes ITS layers, so the core hooks are
  //   effective again. MODEL[table] is the MATERIALISED view (per hook: the highest layer defining it) - readers are unchanged. No opts => owner 'core', exactly the old merge behaviour.
  var MODEL = {}, MODEL_L = LR.create();   // table -> { beforeSave(trx,row,isNew,old), afterSave(trx,row,isNew,old), afterDelete(trx,row) } — the M*.java overrides
  function _remodel(t) {
    var ls = MODEL_L.layers(t);
    if (!ls.length) delete MODEL[t]; else MODEL[t] = Object.assign.apply(null, [{}].concat(ls.map(function (r) { return r.value; })));
  }
  function registerModel(table, impl, opts) { var t = table.toLowerCase(); MODEL_L.add(t, impl, opts); _remodel(t); }
  function unregisterModel(table, owner) { var t = table.toLowerCase(), n = MODEL_L.remove(t, owner); _remodel(t); return n; }
  // §EVENT_SEQ - the ordered trace of model events (prompts/ERP_FRIENDLY_OPS_LENS.md §8). Off unless env.eventSeq is set; then every
  // model/validator/write/doc-action step of save(), remove() and processIt() appends { n, event, table } to trx._events and says one line.
  // ids are left out on purpose (temporary ids differ between runs); the sequence compares by (event, table).
  function ev(trx, event, table) {
    if (!trx || !trx.env || !trx.env.eventSeq) return;
    var n = (trx._evSeq = (trx._evSeq || 0) + 1); (trx._events = trx._events || []).push({ n: n, event: event, table: table });
    trx.say('§EVENT_SEQ n=' + n + ' table=' + table + ' event=' + event);
  }
  function fire(trx, timing, table, row, extra) {
    ev(trx, 'V.' + timing, table);
    if (!MV || typeof MV.fireHooks !== 'function') return null;
    var r = MV.fireHooks(timing, Object.assign({ table: table, record: row }, extra || {}), Object.assign({ trx: trx }, trx.env.ctx || {}));
    return r && !r.ok ? (r.error || ('blocked by ' + r.blocked)) : null;
  }
  // ── observers (the bus's OBSERVE class, ad_modelval.js): post* events and {observe:true} subscriptions are QUEUED on the Trx (trx._observed) and delivered by the host AFTER the group committed
  //   (deliverObserved below). A save/remove that fails drops what it queued; a savepoint rollback drops its share; a run() that refuses returns none. Nothing is queued when nobody observes.
  function obsMark(trx) { return (trx._observed || []).length; }
  function obsTrunc(trx, n) { if (trx._observed && trx._observed.length > n) trx._observed.length = n; }
  function postEvent(trx, timing, table, row, old, repl) {                   // PO.java:2799-2804 / :4544 postEvent(PO_POST_CREATE | PO_POST_UPADTE | PO_POST_DELETE)
    var topic = MV.topicOf ? MV.topicOf(timing) : null;
    if (!topic || !MV.hasObservers || !MV.hasObservers(table, topic)) return;
    MV.queueObserve(trx._observed || (trx._observed = []), topic, { table: table, record: row, recordOld: old || null, isReplication: !!repl });
  }
  // ── the DB's unique-index refusal (B0, prompts/TEAM_REPLICATION_PLUGIN_STUDY.md §13.2 — Witness: W-IMPORT-ORDER UNIQUE) ────────────────────────────────────────────────────────────────────────────────
  // Legacy's database refuses a duplicate key at INSERT and at UPDATE: PostgreSQL "ERROR: duplicate key value violates unique constraint <index> / Detail: Key (cols)=(vals) already exists." The list of those indexes
  // is ad_ddl_unique (= pg_indexes of the reference schema, patches/ad_seed.db.sql); the SQLite file carries no index, so the check is made HERE, once, on the save path every ported process and the WebServices use
  // (ws_adinterface.js had the only copy; it now calls nothing - ML.save reaches this). NULL columns never collide (a unique index ignores a row with a NULL key column). The scan is the Trx's own view
  // (find: base rows overlaid with this transaction's pending writes), so a duplicate of a row written earlier in the SAME transaction is refused too, as the DB would. Columns that carry a physical DEFAULT
  // (ad_ddl_default) count with that value, as Trx.insert will stamp it. changed (UPDATE only): the row's changed column names - PostgreSQL re-checks an index only when its key changes, and a seed that already
  // holds a duplicate must stay editable; omit it to check every index. Returns the PG text, or null.
  function uniqueError(trx, table, row, selfId, changed) {
    table = String(table).toLowerCase();
    var ix; try { ix = trx.q('SELECT indexname, columns FROM ad_ddl_unique WHERE tablename=?', [table]); } catch (e) { return null; }   // a database without the index list (a scratch db): nothing to enforce
    if (!ix || !ix.length) return null;
    var idc = trx.idCol(table), dd = ddlDefaults(trx, table);
    for (var i = 0; i < ix.length; i++) {
      var cs = String(ix[i].columns).split(',').map(function (c) { return c.trim().toLowerCase(); }), vals = [], where = {}, skip = false;
      if (changed && !cs.some(function (c) { return changed.indexOf(c) >= 0; })) continue;
      cs.forEach(function (c) { var v = row[c]; if (v == null && dd[c] != null) v = dd[c]; if (v == null && c === 'ad_client_id' && trx.env.client != null) v = trx.env.client; if (v == null) skip = true; vals.push(v); where[c] = v; });   // Trx.insert stamps AD_Client_ID from the session when the row has none
      if (skip) continue;                                                                                                // NULLs never collide
      if (cs.length === 1 && cs[0] === idc && isNewId(vals[0])) continue;                                                // a key still to be assigned (placeholder) cannot be taken
      var hit = trx.find(table, where).filter(function (r) { return selfId == null || String(r[idc]) !== String(selfId); })[0];
      if (hit) return 'ERROR: duplicate key value violates unique constraint "' + ix[i].indexname + '"\n  Detail: Key (' + cs.join(', ') + ')=(' + vals.join(', ') + ') already exists.';   // PG's own Detail line
    }
    return null;
  }
  // save — PO.save (PO.java saveNew/saveUpdate): beforeSave → validators → write → afterSave → validators.
  // opts.isReplication = PO.saveReplica(true): the AFTER timing is the *_REPLICATION one INSTEAD of afterNew/afterChange (PO.java:2783-2789; the twin's AFTER_SAVE alias is a NEW-or-CHANGE alias so it
  //   does not fire either), the received key is kept (Trx.insert keepKey, :3530-3535). The BEFORE timings and the model class's beforeSave/afterSave are not replica-gated in legacy.
  function save(trx, table, row, changes, opts) {
    var mark = obsMark(trx), r = _save(trx, table, row, changes, opts);
    if (!r.ok) obsTrunc(trx, mark);
    return r;
  }
  function _save(trx, table, row, changes, opts) {
    table = table.toLowerCase();
    var repl = !!(opts && opts.isReplication), rx = repl ? { isReplication: true } : null;
    var isNew = row == null, M = MODEL[table] || {}, old = isNew ? null : Object.assign({}, row);
    var rec = isNew ? Object.assign({}, changes) : Object.assign({}, row, changes);
    if (!isNew && !Object.keys(changes || {}).some(function (k) { var a = row[k], b = changes[k]; return !same(a, b) || (a == null) !== (b == null); })) return { ok: true, row: row };   // PO.save :2425 — !newRecord && !is_Changed() → true, no hooks
    if (M.beforeSave) { ev(trx, 'M.beforeSave', table); var e0 = M.beforeSave(trx, rec, isNew, old); if (e0) return { ok: false, error: e0 }; }
    var e1 = fire(trx, isNew ? 'BEFORE_NEW' : 'BEFORE_CHANGE', table, rec, Object.assign({ recordOld: old }, rx)) || fire(trx, 'BEFORE_SAVE', table, rec, Object.assign({ recordOld: old }, rx));
    if (e1) return { ok: false, error: e1 };
    var live;
    if (isNew) { saveNewNumbers(trx, table, rec); var eu = uniqueError(trx, table, rec, null); if (eu) return { ok: false, error: eu }; ev(trx, 'WRITE_INSERT', table); live = trx.insert(table, rec, repl ? { keepKey: true } : null); }   // the DB refuses a duplicate key at the INSERT (B0)
    else { var ch = {}; for (var k in rec) if (!same(rec[k], row[k]) || (rec[k] == null) !== (row[k] == null)) ch[k] = rec[k]; var eu2 = uniqueError(trx, table, rec, row[trx.idCol(table)], Object.keys(ch)); if (eu2) return { ok: false, error: eu2 }; ev(trx, 'WRITE_UPDATE', table); live = trx.update(table, row, ch); }   // ... and at the UPDATE of an indexed column (B0)
    if (M.afterSave) { ev(trx, 'M.afterSave', table); var e2 = M.afterSave(trx, live, isNew, old); if (e2) return { ok: false, error: e2 }; }
    var e3 = fire(trx, isNew ? (repl ? 'AFTER_NEW_REPLICATION' : 'AFTER_NEW') : (repl ? 'AFTER_CHANGE_REPLICATION' : 'AFTER_CHANGE'), table, live, Object.assign({ recordOld: old }, rx))
          || (repl ? null : fire(trx, 'AFTER_SAVE', table, live, { recordOld: old }));
    if (e3) return { ok: false, error: e3 };
    if (repl) trx.say('§BUS_REPLICA table=' + table + ' ' + (isNew ? 'new' : 'change') + ' fired=' + (isNew ? 'afterNewReplication' : 'afterChangeReplication') + ' (not ' + (isNew ? 'afterNew' : 'afterChange') + ') key=' + live[trx.idCol(table)]);
    postEvent(trx, isNew ? 'POST_CREATE' : 'POST_UPDATE', table, live, old, repl);
    (trx._saved = trx._saved || {})[table + ':' + live[trx.idCol(table)]] = Object.assign({}, live);   // PO.save resets is_ValueChanged: the next save of the SAME PO diffs from here (runWorkflow §DOC-SAVE)
    return { ok: true, row: live };
  }
  // fireReplica(trx, table, row, {isNew}) — the REPLICA timing of a row RECEIVED from another device that the Team projection has ALREADY placed (bim-compiler prompts/TEAM_REPLICATION_PLUGIN_STUDY.md
  //   §13.2, 2.6). Legacy fires TYPE_AFTER_NEW_REPLICATION / TYPE_AFTER_CHANGE_REPLICATION inside po.saveReplica (PO.java:2783-2789); here the row is placed by the projection (the comm log is the
  //   truth: reorder, refold, all-or-none) and the core then fires the SAME after-timing (stages 1-4: validators, client validators, AD_Table_ScriptValidator rows, handlers) and the post*
  //   observer with isReplication. Writes the listeners make ride the caller's group. NAMED deviations: no BEFORE timing (the row is already placed, a veto could not take effect - §9.3 item 1);
  //   recordOld is not known for a received change (null); a received delete fires nothing. Returns {ok, error} - the caller (the host) decides what a listener error does (§13.2: dropped, recorded).
  function fireReplica(trx, table, row, opts) {
    table = String(table).toLowerCase(); var isNew = !!(opts && opts.isNew);
    var timing = isNew ? 'AFTER_NEW_REPLICATION' : 'AFTER_CHANGE_REPLICATION';
    var e = fire(trx, timing, table, row, { recordOld: null, isReplication: true });
    if (e) return { ok: false, error: e };   // fireReplica
    trx.say('§BUS_REPLICA table=' + table + ' received ' + (isNew ? 'new' : 'change') + ' fired=' + (isNew ? 'afterNewReplication' : 'afterChangeReplication') + ' key=' + (row ? row[trx.idCol(table)] : null));
    postEvent(trx, isNew ? 'POST_CREATE' : 'POST_UPDATE', table, row, null, true);   // received-row observers
    return { ok: true, row: row };
  }
  // saveReplica — PO.saveReplica(true) (PO.java:2968-2973): the save of a row RECEIVED from another station - fires the replica timings, keeps its key. Phase 1 seam: nothing in the host calls it yet.
  function saveReplica(trx, table, row, changes) { return save(trx, table, row, changes, { isReplication: true }); }
  function saveReplicaEx(trx, table, row, changes) { var r = saveReplica(trx, table, row, changes); if (!r.ok) throw new Error(r.error || 'SaveError'); return r.row; }
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
  function remove(trx, table, row, opts) {
    var mark = obsMark(trx), r = _remove(trx, table, row, opts);
    if (!r.ok) obsTrunc(trx, mark);
    return r;
  }
  // PO.delete :4300 - a replica delete fires beforeDeleteReplication INSTEAD OF beforeDelete (there is no afterDeleteReplication: TYPE_AFTER_DELETE fires either way)
  function _remove(trx, table, row, opts) {
    table = table.toLowerCase();
    var repl = !!(opts && opts.isReplication), rx = repl ? { isReplication: true } : null;
    var M = MODEL[table] || {};
    if (M.beforeDelete) { ev(trx, 'M.beforeDelete', table); var e0 = M.beforeDelete(trx, row); if (e0) return { ok: false, error: e0 }; }   // PO.delete → beforeDelete (model) before the validators
    var e1 = fire(trx, repl ? 'BEFORE_DELETE_REPLICATION' : 'BEFORE_DELETE', table, row, rx); if (e1) return { ok: false, error: e1 };
    ev(trx, 'WRITE_DELETE', table); trx.del(table, row);
    if (M.afterDelete) { ev(trx, 'M.afterDelete', table); var e2 = M.afterDelete(trx, row); if (e2) return { ok: false, error: e2 }; }
    var e3 = fire(trx, 'AFTER_DELETE', table, row, rx); if (e3) return { ok: false, error: e3 };
    if (repl) trx.say('§BUS_REPLICA table=' + table + ' delete fired=beforeDeleteReplication (not beforeDelete)');
    postEvent(trx, 'POST_DELETE', table, row, null, repl);                   // PO.java:4544
    return { ok: true };
  }
  function removeReplica(trx, table, row) { return remove(trx, table, row, { isReplication: true }); }

  // ══ DocAction — the extension point ══════════════════════════════════════════════════════════════════════
  // registerDocAction(table, impl): impl is the DocAction class — { prepareIt, completeIt, approveIt, voidIt, closeIt,
  // reverseCorrectIt, reverseAccrualIt, reActivateIt, getSummary } each fn(trx, doc) → status string (prepare/complete)
  // or boolean. A plugin bundle calls this through PluginRegistry ctx.docAction — no host code per table.
  var DOCS = {}, _poster = null;
  function setPoster(fn) { _poster = fn; }
  // CLIENT_ACCOUNTING = MClient.isClientAccountingImmediate()/Queue() (MClient.java:1049-1087; MSysConfig.getValue(CLIENT_ACCOUNTING, default 'Q', AD_Client_ID) = the AD_SysConfig row of the client, else of System, org 0).
  //   'I' = DocumentEngine posts right after a Complete (DocumentEngine.java:349); 'Q' = queued (Posted='N' until the Tenant Accounting Processor, AD_Process 53187, posts it); 'D' = disabled.
  //   MEASURED for GardenWorld (client 11): AD_SysConfig 50034 CLIENT_ACCOUNTING = 'I' at System level (migration-historic/353a-354a/postgresql/572_FR2857807.sql:3; value 'I' in build/erp/ad_full.db, updated 2020-10-03),
  //   carried by the twin seed patch (patches/ad_seed.db.sql:41). The Java default 'Q' applies only when NO row exists; AD_Client.IsPostImmediate is only a stored flag (nothing in the Java reads it). So legacy posts on Complete here.
  //   Source order: trx.env.clientAccounting (a caller / witness override) > the ad_sysconfig row (client, else System; org 0; active) > no row in an existing table = the Java default 'Q' > 'I' for a DB with no ad_sysconfig table at all (= how the twin behaved before this switch existed).
  function clientAccounting(trx) {
    if (trx.env.clientAccounting != null && trx.env.clientAccounting !== '') return { mode: String(trx.env.clientAccounting).toUpperCase(), source: 'env.clientAccounting' };
    var r = null, hasTable = true;
    try { r = trx.q("SELECT value FROM ad_sysconfig WHERE name='CLIENT_ACCOUNTING' AND ad_client_id IN (0,?) AND COALESCE(ad_org_id,0)=0 AND COALESCE(isactive,'Y')='Y' ORDER BY ad_client_id DESC", [trx.env.client])[0]; } catch (e) { r = null; hasTable = false; }
    if (r && r.value != null && r.value !== '') return { mode: String(r.value).toUpperCase(), source: 'ad_sysconfig' };
    if (hasTable) return { mode: 'Q', source: 'ad_sysconfig has no CLIENT_ACCOUNTING row - the Java default Q (MClient.java:1063-1065)' };
    return { mode: 'I', source: 'no ad_sysconfig table in this DB - twin default I' };
  }
  var DOCS_L = LR.create();   // layered like MODEL: DOCS[table] = the effective DocAction class (highest layer)
  function _redoc(t) { var top = DOCS_L.top(t); if (top) DOCS[t] = top.value; else delete DOCS[t]; }
  function registerDocAction(table, impl, opts) { var t = table.toLowerCase(); DOCS_L.add(t, impl, opts); _redoc(t); return Object.keys(DOCS).length; }
  function unregisterDocAction(table, owner) { var t = table.toLowerCase(), n = DOCS_L.remove(t, owner); _redoc(t); return n; }
  // removeOwner - everything one bundle contributed to MODEL + DOCS (plugin_registry stop). Returns { models, docs }.
  function removeOwner(owner) {
    var m = 0, d = 0;
    MODEL_L.keys().forEach(function (t) { var n = MODEL_L.remove(t, owner); if (n) { m += n; _remodel(t); } });
    DOCS_L.keys().forEach(function (t) { var n = DOCS_L.remove(t, owner); if (n) { d += n; _redoc(t); } });
    return { models: m, docs: d };
  }
  // describe - a plain dump for witnesses: model hooks per table (with the layer owners) and the effective doc-action tables.
  function describe() {
    var models = {}; MODEL_L.keys().sort().forEach(function (t) { models[t] = MODEL_L.layers(t).map(function (r) { return r.owner + '@' + r.rank + ':' + Object.keys(r.value).sort().join(','); }); });
    var docs = {}; DOCS_L.keys().sort().forEach(function (t) { docs[t] = DOCS_L.layers(t).map(function (r) { return r.owner + '@' + r.rank; }); });
    return { models: models, docs: docs };
  }
  function docActionFor(table) { return DOCS[(table || '').toLowerCase()] || null; }

  // DocumentEngine.processIt(action) — process/DocumentEngine.java:301-360 + prepareIt :489-498 + completeIt.
  // The document's DocStatus is written by the ENGINE (setDocStatus after each step), DocAction by the class.
  // DocumentEngine.getActionOptions :730-762 - the ENGINE's coarse action list per DocStatus (distinct from, and narrower than, getValidActions which the UI offers: a Distribution Order
  // offers Close while InProgress yet the engine below refuses it - the oracle showed it, LIBERO_DD_SPEC.md §RESULT D-CLOSE-IP)
  function engineActions(st) {
    if (st === 'IN') return ['PR', 'IN', 'XL', 'VO'];
    if (st === 'DR') return ['PR', 'IN', 'CO', 'XL', 'VO'];
    if (st === 'IP' || st === 'AP') return ['CO', 'WC', 'AP', 'RJ', 'XL', 'VO', 'PR'];
    if (st === 'NA') return ['RJ', 'PR', 'XL', 'VO'];
    if (st === 'WP' || st === 'WC') return ['CO', 'WC', 'RE', 'VO', 'CL'];
    if (st === 'CO') return ['CL', 'RE', 'RA', 'RC', 'PO', 'VO'];
    if (st === 'CL') return ['PO', 'RE'];
    if (st === 'RE' || st === 'VO') return ['PO'];
    return [];
  }
  function processIt(trx, table, id, action) {
    table = table.toLowerCase();
    var impl = DOCS[table], doc = trx.get(table, id);
    if (!impl) return { ok: false, status: doc && doc.docstatus, msg: 'no DocAction class registered for ' + table };
    if (!doc) return { ok: false, status: null, msg: table + ' ' + id + ' not found' };
    // DocumentEngine.processIt(processAction, docAction) :248-296: the requested (workflow) action when valid for the status, else the document's own DocAction, else nothing / refused
    var eng = engineActions(doc.docstatus || 'DR'), docAct = doc.docaction;
    if (eng.indexOf(action) < 0) {
      if (eng.indexOf(docAct) >= 0) { trx.say('§MODEL-ENGINE action ' + action + ' not valid for status ' + doc.docstatus + ' - DocumentEngine runs the document DocAction ' + docAct + ' (:259-261)'); action = docAct; }
      else if (action === '--' || docAct === '--') return { ok: true, status: doc.docstatus, msg: trx._msg };
      else return { ok: false, status: doc.docstatus, msg: 'Status=' + doc.docstatus + ' - Invalid Actions: Process=' + action + ', Doc=' + docAct };
    }
    trx._msg = null; ev(trx, 'DOC:' + action, table);
    function setStatus(s) { trx.update(table, doc, { docstatus: s }); }
    var st = doc.docstatus;
    if (action === 'PR') { ev(trx, 'DOC:prepareIt', table); var p = impl.prepareIt(trx, doc); setStatus(p); return { ok: p === 'IP', status: p, msg: trx._msg }; }
    if (action === 'CO' || action === 'WC') {
      if (st === 'DR' || st === 'IN' || st == null) {                     // :325-330 prepare if not prepared yet
        ev(trx, 'DOC:prepareIt', table); var ps = impl.prepareIt(trx, doc); setStatus(ps);
        if (ps !== 'IP') return { ok: false, status: ps, msg: trx._msg };
      }
      var outer = trx._docsPost; trx._docsPost = [];                       // this document's IDocsPostProcess list
      ev(trx, 'DOC:completeIt', table); var cs = impl.completeIt(trx, doc); setStatus(cs);
      var docsPost = trx._docsPost; trx._docsPost = outer;
      var ok = cs === 'CO' || cs === 'IP' || cs === 'WP' || cs === 'WC';  // :330-333
      if (ok && docsPost.length) docsPost.forEach(function (d) {          // :335-346 docafter.setProcessedOn("Processed") + saveEx
        var r = trx.get(d.table, d.id); if (r && trx.env.nowMillis != null) save(trx, d.table, r, { processedon: trx.env.nowMillis + (trx._procSeq = (trx._procSeq || 0) + 1) / 1000 }   /* monotonic within the recorded clock (PO.setProcessedOn :1108-1138) */); });
      // :349-372 MClient.isClientAccountingImmediate → postIt (env.postImmediate overrides; env.noPost = accounting queued), then each
      // queued docafter whose OWN instance says Posted<>'Y' → DocumentEngine.postImmediate(…, force=true) = a repost
      var ca = ok && cs === 'CO' && !trx.env.noPost ? clientAccounting(trx) : null;                          // DocumentEngine.java:349 MClient.isClientAccountingImmediate()
      if (ca && ca.mode !== 'I') trx.say('§MODEL-POST-QUEUED table=' + table + ' id=' + id + ' CLIENT_ACCOUNTING=' + ca.mode + ' (' + ca.source + ') - Posted stays N until the Tenant Accounting Processor (AD_Process 53187) runs');
      if (ok && cs === 'CO' && !trx.env.noPost && ca.mode === 'I') { var P = typeof trx.env.postImmediate === 'function' ? trx.env.postImmediate : _poster;
        if (P) { ev(trx, 'DOC:post', table); P(trx, table, trx.get(table, id));
          docsPost.forEach(function (d) { if (d.posted === 'Y') return; var r = trx.get(d.table, d.id); if (r) P(trx, d.table, r, { repost: true }); }); } }
      return { ok: ok, status: cs, msg: trx._msg };
    }
    var m = { AP: 'approveIt', RJ: 'rejectIt', VO: 'voidIt', CL: 'closeIt', RC: 'reverseCorrectIt', RA: 'reverseAccrualIt', RE: 'reActivateIt' }[action];
    if (!m || typeof impl[m] !== 'function') return { ok: false, status: st, msg: 'DocAction ' + action + ' not implemented by the ' + table + ' class (named, not faked)' };
    ev(trx, 'DOC:' + m, table); var res = impl[m](trx, doc);
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
        var before = Object.assign({}, trx.get(table, id)), skey = table + ':' + id; if (trx._saved) delete trx._saved[skey];
        res = processIt(trx, table, id, da);
        if (trx._saved && trx._saved[skey]) before = trx._saved[skey];   // the action saved the document itself (e.g. voidIt :767-775): m_po's changed-columns restart there
        text = impl && impl.getSummary ? impl.getSummary(trx, trx.get(table, id)) : null;
        // MWFActivity.performWork :1131-1140 - `m_po.save()` AFTER doc.processIt, success or not: the document's own changes (DocStatus, Processed, DocAction ...) are saved through PO.save, so
        //   beforeSave, the BEFORE/AFTER_CHANGE model validators (recordOld = the row before the action) and afterSave run, as in legacy (MFG_Validator's C_Order AFTER_CHANGE reads it;
        //   bim-compiler prompts/mfg ... LIBERO_CORE_HOOKS_SPEC.md §DOC-SAVE). A refused save = "SaveError": the node fails.
        var now = trx.get(table, id), chg = {};
        if (now) Object.keys(now).forEach(function (k) { if (!same(now[k], before[k]) || (now[k] == null) !== (before[k] == null)) chg[k] = now[k]; });
        if (Object.keys(chg).length) { var sv = save(trx, table, before, chg); if (!sv.ok) { res = { ok: false, status: null, msg: sv.error || 'SaveError' }; } }
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
      else if (spec.timing === 'SAVE') r = save(trx, table, spec.id != null ? trx.get(table, spec.id) : null, spec.changes || {}, spec.isReplication ? { isReplication: true } : null);
      else if (spec.timing === 'AFTER_SAVE') {
        // the host has ALREADY written the record (its own CRUD op in the same group): make it visible to the Trx
        // without re-emitting it, then run PO.afterSave + the AFTER_NEW|CHANGE validators exactly as save() would.
        var rec = {}; for (var rk in spec.record) rec[rk.toLowerCase()] = spec.record[rk];
        // the host's op carries only the FORM values; Client/Org are stamped later from op.stdDefaults (crud_core.js CRUD_CREATE fold, PO.setStandardDefaults
        // PO.java:1973-2000 = the session Env) -- the model must see them now, from the same session env, or every client-scoped afterSave lookup answers "no rows"
        if (rec.ad_client_id == null && trx.env.client != null) rec.ad_client_id = trx.env.client;
        if (rec.ad_org_id == null && trx.env.org != null) rec.ad_org_id = trx.env.org;
        trx._p(table)[String(rec[trx.idCol(table)])] = { row: rec, orig: Object.assign({}, rec), isNew: false, opIdx: null };
        var M = MODEL[table] || {}, e = M.afterSave ? M.afterSave(trx, rec, !!spec.isNew, spec.old || null) : null;
        if (!e) e = fire(trx, spec.isNew ? 'AFTER_NEW' : 'AFTER_CHANGE', table, rec, { recordOld: spec.old || null }) || fire(trx, 'AFTER_SAVE', table, rec, { recordOld: spec.old || null });
        r = { ok: !e, error: e };
        if (!e) postEvent(trx, spec.isNew ? 'POST_CREATE' : 'POST_UPDATE', table, rec, spec.old || null, false);   // the host row IS saved: its post event rides this group (delivered after the host commits it)
      }
      else if (spec.timing === 'PROCESS') { r = spec.fn(trx, spec); }   // a plugin process run in ONE Trx: its op group is all-or-none and traced by §EVENT_SEQ
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
    var observed = r && r.ok !== false ? (trx._observed || []) : [];         // a refused group queues nothing for delivery (W-BUS-OBSERVE rollback)
    observed.opMap = r && r.ok !== false ? trx._opMap || null : null;
    return Object.assign({ ok: r.ok !== false, ops: ops, log: trx.log, trx: trx }, r, { ops: ops, observed: observed });
  }
  // deliverObserved(runResult | bag, ctx, resolve) - the host calls this AFTER the group's commitGroup succeeded (never before, never for a group that did not commit): the post* events and the
  //   {observe:true} subscriptions of every save/delete in the group, once. resolve(finalOpIndex, table) -> the committed key of a row created in the group (omit: placeholders stay, info.unresolved).
  function deliverObserved(res, ctx, resolve) { return MV.deliverObserved(res && res.observed !== undefined ? res.observed : res, ctx || {}, resolve); }

  return { PO: PO, po: po, newRecord: newRecord, setDocNoAllocator: setDocNoAllocator, columnsOf: columnsOf, setPoster: setPoster, getPoster: function () { return _poster; }, clientAccounting: clientAccounting, MV: MV, Trx: Trx, D: D, N: N, isNewId: isNewId, keyColsOf: keyColsOf, newPO: newPO, copyValues: copyValues, saveEx: saveEx, registerModel: registerModel, unregisterModel: unregisterModel, saveReplica: saveReplica, fireReplica: fireReplica, saveReplicaEx: saveReplicaEx, removeReplica: removeReplica, deliverObserved: deliverObserved, unregisterDocAction: unregisterDocAction, removeOwner: removeOwner, describe: describe, MODEL: MODEL, fire: fire,
           save: save, remove: remove, registerDocAction: registerDocAction, docActionFor: docActionFor, DOCS: DOCS,
           uniqueError: uniqueError,   // B0: the legacy unique-index refusal, ONE implementation (ws_adinterface.js no longer has its own)
           eventSeq: function (trx) { return (trx && trx._events || []).map(function (e) { return e.event + '@' + e.table; }); }, processIt: processIt, runWorkflow: runWorkflow, workflowOf: workflowOf, tableIdOf: tableIdOf, run: run };
});
