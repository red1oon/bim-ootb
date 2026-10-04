// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ad_callout.js — the iDempiere CALLOUT RUNTIME, ported as ONE generic layer (AD-LAYER LAW: no per-window code).
//   Implementing bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §CP (core callouts) — Witness: W-CP-CALLOUT-ORACLE.
// What it ports (M = org.adempiere.base/src/org/compiere/model, U = .../compiere/util):
//   Env context      ← U/Env.java:322-530 setContext, :604-760 getContext, :941-1010 isSOTrx/getContextAsDate
//   GridField value  ← M/GridField.java:2102-2170 setValue/updateContext, :305 getDependentOn
//   GridTab row      ← M/GridTab.java:2849-2885 setValue, :2912-3170 processFieldChange/processCallout,
//                      :1151-1190 dataNew callout fan; M/GridTable.java:1387-1440 setValueAt, :3581 isValueChanged
//   UI cascade       ← zk ADTabpanel.java:1692-1712 dataStatusChanged (a callout's setValue fires the target's callouts)
//   CalloutEngine    ← M/CalloutEngine.java:54-338 (start, isCalloutActive, dateAcct, checkPeriodOpen, rate)
// The callout CLASSES live in erp/callouts/*.js, one file per Java class, registered with defineCallout(fqcn, factory).
// Callout bodies dispatch by the AD_Column.Callout string ("a.b.Class.method;…", M/GridTab.java:3003-3006 tokenizer).
// Types cross the API as Java does: ID/Integer → JS int, Amount/Number/Qty/CostPrice → BigDecimal, Date → Timestamp,
// YesNo → boolean, else string. PURE: the host injects query(sql,params)->rows (lower-case keys, column order kept).
(function (global) {
  'use strict';
  var BD = (typeof module !== 'undefined' && module.exports) ? require('./bigdecimal') : global.BigDecimal;
  var RM = BD.RoundingMode;

  // ══ Timestamp (java.sql.Timestamp, day precision is what the AD stores) ══════════════════════════════
  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = '0' + n; return n; }
  function Timestamp(v) {
    if (!(this instanceof Timestamp)) return new Timestamp(v);
    var ms;
    if (v instanceof Timestamp) ms = v.ms;
    else if (typeof v === 'number') ms = v;
    else {
      var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?/.exec(String(v));
      if (!m) throw new TypeError('Timestamp: bad value "' + v + '"');
      ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    }
    this.ms = ms;
  }
  Timestamp.valueOf = function (s) { return new Timestamp(s); };
  Timestamp.of = function (v) { if (v == null || v === '') return null; if (v instanceof Timestamp) return v; try { return new Timestamp(v); } catch (e) { return null; } };
  Timestamp.prototype.getTime = function () { return this.ms; };
  Timestamp.prototype.toString = function () {   // JDBC escape format, DisplayType.getTimestampFormat_Default
    var d = new Date(this.ms);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' +
      pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
  };
  Timestamp.prototype.toJSON = Timestamp.prototype.toString;
  Timestamp.prototype.compareTo = function (o) { return this.ms < o.ms ? -1 : this.ms > o.ms ? 1 : 0; };
  Timestamp.prototype.equals = function (o) { return o instanceof Timestamp && o.ms === this.ms; };
  Timestamp.prototype.before = function (o) { return this.ms < o.ms; };
  Timestamp.prototype.after = function (o) { return this.ms > o.ms; };
  // TimeUtil (U/TimeUtil.java) — the day arithmetic the callouts use
  var TimeUtil = {
    getDay: function (t) { if (t == null) t = new Timestamp(Date.now()); var d = new Date(Timestamp.of(t).ms); return new Timestamp(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); },
    addDays: function (t, n) { if (t == null) return null; return new Timestamp(TimeUtil.getDay(t).ms + n * 86400000); },
    trunc: function (t) { return TimeUtil.getDay(t); },
    isSameDay: function (a, b) { return TimeUtil.getDay(a).ms === TimeUtil.getDay(b).ms; },
    getDaysBetween: function (a, b) { return Math.round((TimeUtil.getDay(b).ms - TimeUtil.getDay(a).ms) / 86400000); }
  };

  // ══ DisplayType (U/DisplayType.java + M/SystemIDs.java:122-173) ══════════════════════════════════════
  var DT = { String: 10, Integer: 11, Amount: 12, ID: 13, Text: 14, Date: 15, DateTime: 16, List: 17, Table: 18, TableDir: 19,
    YesNo: 20, Location: 21, Number: 22, Binary: 23, Time: 24, Account: 25, RowID: 26, Color: 27, Button: 28, Quantity: 29,
    Search: 30, Locator: 31, Image: 32, Assignment: 33, Memo: 34, PAttribute: 35, TextLong: 36, CostPrice: 37, FilePath: 38,
    FileName: 39, URL: 40, PrinterName: 42, Payment: 200012, Chart: 53370, RecordID: 200202, JSON: 200267,
    TimestampWithTimeZone: 200133 };
  DT.isID = function (t) { return [DT.ID, DT.Table, DT.TableDir, DT.Search, DT.Location, DT.Locator, DT.Account, DT.Assignment,
    DT.PAttribute, DT.Image, DT.Chart, DT.RecordID].indexOf(t) >= 0; };
  DT.isNumeric = function (t) { return [DT.Amount, DT.Number, DT.CostPrice, DT.Integer, DT.Quantity].indexOf(t) >= 0; };
  DT.isDate = function (t) { return t === DT.Date || t === DT.DateTime || t === DT.Time || t === DT.TimestampWithTimeZone; };
  DT.isLookup = function (t) { return [DT.List, DT.Payment, DT.Table, DT.TableDir, DT.Search, 200233, 200234, 200235, 200152, 200161, 200162, 200163].indexOf(t) >= 0; };
  DT.isText = function (t) { return [DT.String, DT.Text, DT.TextLong, DT.JSON, DT.Memo, DT.FilePath, DT.FileName, DT.URL, DT.PrinterName, DT.Color].indexOf(t) >= 0; };

  // typed(dt, raw) — a stored/typed value → the Java object the GridField would hold (GridTable.readData types).
  function typed(dt, v) {
    if (v === undefined || v === null) return null;
    if (v instanceof BD || v instanceof Timestamp || typeof v === 'boolean') {
      if (dt === DT.YesNo && typeof v !== 'boolean') return String(v) === 'Y';
      return v;
    }
    if (dt === DT.YesNo) return v === true || String(v) === 'Y' || String(v) === 'true';
    if (DT.isID(dt) || dt === DT.Integer) { if (String(v).trim() === '') return null; var n = Number(v); return isNaN(n) ? null : Math.trunc(n); }
    if (DT.isNumeric(dt)) { if (String(v).trim() === '') return null; return toBD(v); }
    if (DT.isDate(dt)) return String(v).trim() === '' ? null : Timestamp.of(v);
    return String(v);
  }
  function toBD(v) {
    if (v == null || v === '') return null;
    if (v instanceof BD) return v;
    if (typeof v === 'number') { if (Number.isInteger(v)) return BD.of(v); return BD.fromString(String(v)); }
    return BD.fromString(String(v).trim());
  }
  // stored(v) — a typed value → the string/number the form/op-log carries.
  function stored(v) {
    if (v == null) return null;
    if (v instanceof BD) return v.toString();
    if (v instanceof Timestamp) return v.toString();
    if (typeof v === 'boolean') return v ? 'Y' : 'N';
    return v;
  }

  // ══ Properties ctx + Env (U/Env.java) ════════════════════════════════════════════════════════════════
  function Ctx(init) { if (!(this instanceof Ctx)) return new Ctx(init); this.p = {}; if (init) for (var k in init) if (init[k] != null) this.p[k] = String(init[k]); }
  Ctx.prototype.getProperty = function (k, d) { return Object.prototype.hasOwnProperty.call(this.p, k) ? this.p[k] : (d === undefined ? null : d); };
  Ctx.prototype.setProperty = function (k, v) { this.p[k] = String(v); };
  Ctx.prototype.remove = function (k) { delete this.p[k]; };
  Ctx.prototype.keys = function () { return Object.keys(this.p); };
  function isEmpty(s) { return s == null || String(s).length === 0; }
  function ctxStr(v) {                                     // Env.setContext overloads: Timestamp / int / boolean / String
    if (v == null) return null;
    if (v instanceof Timestamp) return v.toString();
    if (typeof v === 'boolean') return v ? 'Y' : 'N';
    if (v instanceof BD) return v.toString();
    return String(v);
  }
  var Env = {
    ZERO: BD.ZERO, ONE: BD.ONE, ONEHUNDRED: BD.of(100),
    AD_CLIENT_ID: '#AD_Client_ID', AD_ORG_ID: '#AD_Org_ID', AD_USER_ID: '#AD_User_ID', AD_ROLE_ID: '#AD_Role_ID',
    M_WAREHOUSE_ID: '#M_Warehouse_ID', DATE: '#Date', C_CURRENCY_ID: '$C_Currency_ID', SALESREP_ID: '#SalesRep_ID',
    TAB_INFO: 1113,
    isGlobalVariable: function (v) { return v.charAt(0) === '#' || v.charAt(0) === '$' || v.charAt(0) === '+'; },   // :2632
    isPreference: function (v) { return v.indexOf('P|') === 0; },                                                     // :2644
    // getContext — overloads by argument shape (Env.java:604, :631, :670, :685, :717, :734)
    getContext: function (ctx, a, b, c, d, e) {
      if (typeof a === 'string') {                                                   // (ctx, context) :604-616
        var value = ctx.getProperty(a, '');
        if (isEmpty(value) && a.charAt(0) !== '#') value = ctx.getProperty('#' + a, '');
        return value;
      }
      if (typeof b === 'string') {                                                   // (ctx, WindowNo, context, onlyWindow) :631-653
        var s = ctx.getProperty(a + '|' + b);
        if (s == null) {
          if (Env.isGlobalVariable(b) || Env.isPreference(b)) return Env.getContext(ctx, b);
          if (c === true) return '';
          return Env.getContext(ctx, '#' + b);
        }
        return s;
      }
      // (ctx, WindowNo, TabNo, context [, onlyTab [, onlyWindow]])
      var t = ctx.getProperty(a + '|' + b + '|' + c);
      if (d === undefined) {                                                         // :685-704
        if (b === Env.TAB_INFO) return t != null ? t : '';
        if (isEmpty(t)) return Env.getContext(ctx, a, c, false);
        return t;
      }
      if (isEmpty(t) && !d) return Env.getContext(ctx, a, c, e === undefined ? d : e);   // :734-742
      return t;
    },
    getContextAsInt: function (ctx, a, b, c) {                                        // :751-847
      var s;
      if (typeof a === 'string') { s = Env.getContext(ctx, a); if (s.length === 0) s = Env.getContext(ctx, 0, a, false); }
      else if (typeof b === 'string') s = Env.getContext(ctx, a, b, !!c);
      else s = Env.getContext(ctx, a, b, c);
      if (isEmpty(s)) return 0;
      var n = parseInt(s, 10); return isNaN(n) || String(n) !== String(s).trim() ? (isNaN(n) ? 0 : n) : n;
    },
    getContextAsDate: function (ctx, a, b) {                                         // :970-1003
      var w = typeof a === 'string' ? 0 : a, k = typeof a === 'string' ? a : b;
      var s = Env.getContext(ctx, w, k, false);
      if (isEmpty(s)) return new Timestamp(Env.now ? Env.now() : Date.now());
      return Timestamp.of(s);
    },
    setContext: function (ctx, a, b, c, d) {                                          // :322-530
      if (typeof a === 'string') { var v0 = ctxStr(b); if (v0 == null || v0.length === 0) ctx.remove(a); else ctx.setProperty(a, v0); return; }
      if (typeof b === 'string') { var v1 = ctxStr(c); if (v1 == null || v1 === '') ctx.remove(a + '|' + b); else ctx.setProperty(a + '|' + b, v1); return; }
      var v2 = ctxStr(d);                                                             // (ctx, WindowNo, TabNo, context, value) :517-530
      if (v2 == null) v2 = /_ID$/.test(c) ? '0' : '';
      ctx.setProperty(a + '|' + b + '|' + c, v2);
    },
    isSOTrx: function (ctx, WindowNo) {                                               // :941-962
      var s = WindowNo === undefined ? Env.getContext(ctx, 'IsSOTrx') : Env.getContext(ctx, WindowNo, 'IsSOTrx', true);
      return !(s != null && s === 'N');
    },
    getAD_Client_ID: function (ctx) { return Env.getContextAsInt(ctx, Env.AD_CLIENT_ID); },
    getAD_Org_ID: function (ctx) { return Env.getContextAsInt(ctx, Env.AD_ORG_ID); },
    getAD_User_ID: function (ctx) { return Env.getContextAsInt(ctx, Env.AD_USER_ID); },
    getAD_Role_ID: function (ctx) { return Env.getContextAsInt(ctx, Env.AD_ROLE_ID); },
    getAD_Language: function (ctx) { var s = Env.getContext(ctx, '#AD_Language'); return isEmpty(s) ? 'en_US' : s; },
    clearWinContext: function (ctx, WindowNo) { ctx.keys().forEach(function (k) { if (k.indexOf(WindowNo + '|') === 0) ctx.remove(k); }); },
    // parseContext (Env.java:1814-1880, DefaultEvaluatee) — @tag@ → window/tab ctx; "" when a tag is unresolved
    parseContext: function (ctx, WindowNo, TabNo, value, onlyTab, ignoreUnparsable, forSQL) {
      if (value == null || value.length === 0) return '';
      var inStr = String(value), out = '', i = inStr.indexOf('@');
      while (i !== -1) {
        out += inStr.substring(0, i); inStr = inStr.substring(i + 1);
        var j = inStr.indexOf('@');
        if (j < 0) { out += '@'; break; }
        if (j === 0) { out += '@'; inStr = inStr.substring(1); i = inStr.indexOf('@'); continue; }
        var token = inStr.substring(0, j), dflt = null;
        if (token.indexOf(':') > 0) { dflt = token.substring(token.indexOf(':') + 1); token = token.substring(0, token.indexOf(':')); }
        var tn = TabNo;
        if (token.charAt(0) === '~') token = token.substring(1);
        var mt = /^(\d+)\|(.*)$/.exec(token); if (mt) { tn = +mt[1]; token = mt[2]; }
        var v;
        if (Env.isGlobalVariable(token)) v = Env.getContext(ctx, token);
        else v = tn == null ? Env.getContext(ctx, WindowNo, token, !!onlyTab) : Env.getContext(ctx, WindowNo, tn, token, !!onlyTab);
        if (isEmpty(v) && dflt != null) v = dflt;
        if (forSQL && v && v.indexOf("'") >= 0) v = v.replace(/'/g, "''");
        if (isEmpty(v)) { if (!ignoreUnparsable) return ''; }
        else out += v;
        inStr = inStr.substring(j + 1); i = inStr.indexOf('@');
      }
      return out + inStr;
    }
  };

  // ══ Msg (U/Msg.java) — AD_Message text via a host dictionary; the key itself when no text is loaded ═════
  var _msgs = {};
  // AD_Message / AD_Element read from the bundle (the self-heal patch ships the rows the ported code uses), cached
  function _dbText(key, element) {
    var ck = (element ? 'element:' : '') + key;
    if (Object.prototype.hasOwnProperty.call(_msgs, ck)) return _msgs[ck];
    var v = null;
    try { var D = (typeof RUNTIME !== 'undefined' && RUNTIME.DB) ? RUNTIME.DB : null;
      if (D) { var r = element ? D.query('SELECT Name AS t FROM AD_Element WHERE ColumnName=?', [key])[0] : D.query('SELECT MsgText AS t FROM AD_Message WHERE Value=?', [key])[0]; v = r ? r.t : null; } } catch (e) { v = null; }
    if (v != null) _msgs[ck] = v;
    return v;
  }
  var Msg = {
    load: function (map) { for (var k in map) if (Object.prototype.hasOwnProperty.call(map, k)) _msgs[k] = map[k]; },
    getMsg: function (ctx, key, args) {
      var t = _dbText(key, false); if (t == null) t = key;
      if (args && args.length) t = t.replace(/\{(\d+)\}/g, function (m, n) { var a = args[+n]; return a == null ? '' : String(a); });
      return t;
    },
    // translate (Msg.java:609-650): AD_Message text, else the AD_Element name, else the key itself
    translate: function (ctx, key) { var t = _dbText(key, false); if (t != null) return t; t = _dbText(key, true); return t != null ? t : key; },
    getElement: function (ctx, col) { var t = _dbText(col, true); return t != null ? t : col; },
    parseTranslation: function (ctx, s) { return String(s).replace(/@([A-Za-z0-9_]+)@/g, function (m, k) { return Msg.translate(ctx, k); }); }
  };
  // AdempiereException / PeriodClosedException analogue: a thrown Error whose message is what Dialog.error shows
  function AdempiereException(msg) { var e = new Error(msg); e.name = 'AdempiereException'; return e; }

  // ══ DB (U/DB.java getSQLValue*, PreparedStatement/ResultSet shape) over the host query fn ═════════════════
  function sqlParam(v) {
    if (v === undefined || v === null) return null;
    if (v instanceof BD) return Number(v.toString());
    if (v instanceof Timestamp) return v.toString();
    if (typeof v === 'boolean') return v ? 'Y' : 'N';
    return v;
  }
  function RS(rows) { this.rows = rows || []; this.i = -1; this._null = false; }
  RS.prototype.next = function () { this.i++; return this.i < this.rows.length; };
  RS.prototype._v = function (c) {
    var r = this.rows[this.i]; if (!r) throw new Error('ResultSet: no current row');
    var v = typeof c === 'number' ? r[Object.keys(r)[c - 1]] : r[String(c).toLowerCase()];
    this._null = (v === null || v === undefined); return this._null ? null : v;
  };
  RS.prototype.wasNull = function () { return this._null; };
  RS.prototype.getInt = function (c) { var v = this._v(c); return v == null ? 0 : Math.trunc(Number(v)); };
  RS.prototype.getBigDecimal = function (c) { var v = this._v(c); return v == null ? null : toBD(v); };
  RS.prototype.getString = function (c) { var v = this._v(c); return v == null ? null : String(v); };
  RS.prototype.getTimestamp = function (c) { var v = this._v(c); return v == null ? null : Timestamp.of(v); };
  RS.prototype.getBoolean = function (c) { var v = this._v(c); return v === 'Y' || v === true || v === 1; };
  RS.prototype.getObject = function (c) { return this._v(c); };
  RS.prototype.close = function () {};
  function PStmt(db, sql) { this.db = db; this.sql = sql; this.params = []; }
  ['setInt', 'setString', 'setBigDecimal', 'setTimestamp', 'setObject', 'setBoolean'].forEach(function (m) {
    PStmt.prototype[m] = function (i, v) { this.params[i - 1] = v; };
  });
  PStmt.prototype.executeQuery = function () { return new RS(this.db.query(this.sql, this.params)); };
  PStmt.prototype.close = function () {};
  function makeDB(query) {
    var db = {
      query: function (sql, params) { return query(sql, (params || []).map(sqlParam)) || []; },
      prepareStatement: function (sql) { return new PStmt(db, sql); },
      _first: function (sql, args) { var r = db.query(sql, args); if (!r.length) return undefined; var k = Object.keys(r[0]); return r[0][k[0]]; },
      // getSQLValue(Ex): int of col 1, -1 when no row (DB.java getSQLValueEx)
      getSQLValue: function (trx, sql) { var a = flat(arguments, 2), v = db._first(sql, a); return v === undefined ? -1 : (v == null ? 0 : Math.trunc(Number(v))); },
      getSQLValueBD: function (trx, sql) { var a = flat(arguments, 2), v = db._first(sql, a); return v == null ? null : toBD(v); },
      getSQLValueString: function (trx, sql) { var a = flat(arguments, 2), v = db._first(sql, a); return v == null ? null : String(v); },
      getSQLValueTS: function (trx, sql) { var a = flat(arguments, 2), v = db._first(sql, a); return v == null ? null : Timestamp.of(v); },
      TO_DATE: function (ts, dayOnly) { if (ts == null) return 'NULL'; var s = Timestamp.of(ts).toString(); return "'" + (dayOnly === false ? s : s.slice(0, 10) + ' 00:00:00') + "'"; },
      TO_STRING: function (s) { return s == null ? 'NULL' : "'" + String(s).replace(/'/g, "''") + "'"; }
    };
    db.getSQLValueEx = db.getSQLValue; db.getSQLValueBDEx = db.getSQLValueBD; db.getSQLValueStringEx = db.getSQLValueString;
    return db;
  }
  function flat(args, from) {
    var a = Array.prototype.slice.call(args, from);
    if (a.length === 1 && Array.isArray(a[0])) return a[0];
    return a;
  }

  // ══ PO reader — MTable.getPO / M*.get(ctx,id) for READ: Java-shaped getters over the dictionary types ═════
  //   getC_UOM_ID() → int, isStocked() → boolean, getPriceStd() → BigDecimal, get_Value("X"). Read-only by design:
  //   callouts never save; a write goes through mTab.setValue (GridTab) only.
  function makePO(db) {
    var typeCache = {};
    function types(table) {
      var k = String(table).toLowerCase();
      if (typeCache[k]) return typeCache[k];
      var o = {};
      try { db.query('SELECT lower(c.columnname) AS c, c.ad_reference_id AS r FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=?', [k])
        .forEach(function (r) { o[r.c] = Number(r.r); }); } catch (e) {}
      return (typeCache[k] = o);
    }
    function wrap(table, row) {
      if (!row) return null;
      var ty = types(table), tk = String(table).toLowerCase();
      function val(col) { var c = String(col).toLowerCase(); return typed(ty[c] || (/_id$/.test(c) ? DT.ID : DT.String), row[c]); }
      var base = {
        get_TableName: function () { return table; },
        get_Value: function (c) { return val(c); },
        get_ValueAsInt: function (c) { var v = val(c); return v == null ? 0 : (typeof v === 'number' ? v : Math.trunc(Number(stored(v)))); },
        get_ValueAsString: function (c) { var v = val(c); return v == null ? '' : String(stored(v)); },
        get_ValueAsBoolean: function (c) { var v = val(c); return v === true || v === 'Y'; },
        get_ID: function () { return val(tk + '_id') || 0; },
        is_new: function () { return false; },
        row: row
      };
      return new Proxy(base, { get: function (t, p) {
        if (p in t) return t[p];
        if (typeof p !== 'string') return undefined;
        var m;
        if ((m = /^get(.+)$/.exec(p))) return function () { return val(m[1]); };
        if ((m = /^is(.+)$/.exec(p))) return function () { var c = m[1].toLowerCase(); var v = row['is' + c] !== undefined ? val('Is' + m[1]) : val(m[1]); return v === true || v === 'Y'; };
        return undefined;
      } });
    }
    var po = {
      types: types, wrap: wrap,
      get: function (table, id) {
        if (id == null || id === '' || (typeof id === 'number' && id < 0 && false)) return null;
        var k = String(table).toLowerCase();
        var r = db.query('SELECT * FROM ' + k + ' WHERE ' + k + '_id=?', [id])[0];
        return r ? wrap(table, r) : null;
      },
      first: function (table, where, params) {
        var r = db.query('SELECT * FROM ' + String(table).toLowerCase() + (where ? ' WHERE ' + where : ''), params || [])[0];
        return r ? wrap(table, r) : null;
      },
      list: function (table, where, params, orderBy) {
        return db.query('SELECT * FROM ' + String(table).toLowerCase() + (where ? ' WHERE ' + where : '') + (orderBy ? ' ORDER BY ' + orderBy : ''), params || [])
          .map(function (r) { return wrap(table, r); });
      }
    };
    return po;
  }

  // ══ Callout class registry (Core.getCallout / IColumnCalloutFactory) ══════════════════════════════════════
  var CLASSES = {};          // fqcn → constructor (CalloutEngine subclass)
  var COLUMN_CALLOUTS = {};  // 'table|column' (lower) → [ {name, start(ctx, WindowNo, mTab, mField, value, oldValue)} ]  (@Callout / IColumnCallout)
  var LEGACY = {};           // 'a.b.Class.method' → fn(ctx, info) → {derived} — the plugin registerHandler shape, adapted
  var _deferredDefs = [];
  function defineCallout(fqcn, factory) {           // factory(CalloutEngine, R) → constructor
    var C = factory(CalloutEngine, RUNTIME);
    CLASSES[fqcn] = C; C.fqcn = fqcn;
    var short = fqcn.split('.').pop();
    if (!CLASSES[short]) CLASSES[short] = C;         // AD rows carry the bare class name too ("CalloutGLJournal.period")
    return C;
  }
  function defineColumnCallout(table, columns, name, start) {
    (Array.isArray(columns) ? columns : [columns]).forEach(function (c) {
      var k = String(table).toLowerCase() + '|' + String(c).toLowerCase();
      (COLUMN_CALLOUTS[k] = COLUMN_CALLOUTS[k] || []).push({ name: name, start: start });
    });
  }
  function findColumnCallouts(table, column) {
    var a = COLUMN_CALLOUTS[String(table).toLowerCase() + '|' + String(column).toLowerCase()] || [];
    var b = COLUMN_CALLOUTS['*|' + String(column).toLowerCase()] || [];
    return a.concat(b);
  }
  function getCallout(className, method) {
    var C = CLASSES[className];
    if (C && typeof C.prototype[method] === 'function') return new C();
    var leg = LEGACY[className + '.' + method];
    if (leg) return new LegacyCallout(leg);
    return null;
  }
  function hasCallout(cmd) {
    var i = cmd.lastIndexOf('.'); if (i < 0) return false;
    return !!getCallout(cmd.substring(0, i), cmd.substring(i + 1));
  }

  // ══ CalloutEngine (M/CalloutEngine.java) ══════════════════════════════════════════════════════════════════
  function CalloutEngine() { this.m_mTab = null; this.m_mField = null; }
  CalloutEngine.NO_ERROR = '';
  // start :54-111 — reflectively invoke the method; an exception becomes the returned message
  CalloutEngine.prototype.start = function (ctx, methodName, WindowNo, mTab, mField, value, oldValue) {
    if (methodName == null || methodName.length === 0) throw new Error('No Method Name');
    this.m_mTab = mTab; this.m_mField = mField;
    var retValue = '';
    try {
      var m = this[methodName];
      if (typeof m !== 'function') throw new Error('Method not found: ' + methodName);
      retValue = m.call(this, ctx, WindowNo, mTab, mField, value, oldValue);
    } catch (ex) {
      retValue = (ex && ex.message) || String(ex);
      if (RUNTIME.log) RUNTIME.log('§CALLOUT-EXCEPTION ' + methodName + ' ' + retValue + (ex && ex.stack ? ' @' + String(ex.stack).split('\n')[1] : ''));
    } finally { this.m_mTab = null; this.m_mField = null; }
    return retValue == null ? '' : retValue;
  };
  // isCalloutActive :178-182 — "greater than 1 instead of 0 to discount this callout instance"
  CalloutEngine.prototype.isCalloutActive = function () { return this.m_mTab != null ? this.m_mTab.getActiveCallouts().length > 1 : false; };
  CalloutEngine.prototype.getGridTab = function () { return this.m_mTab; };
  CalloutEngine.prototype.getGridField = function () { return this.m_mField; };
  // dateAcct :197-205
  CalloutEngine.prototype.dateAcct = function (ctx, WindowNo, mTab, mField, value) {
    if (this.isCalloutActive()) return CalloutEngine.NO_ERROR;          // assuming it is resetting value
    if (value == null || !(value instanceof Timestamp)) return CalloutEngine.NO_ERROR;
    mTab.setValue('DateAcct', value);
    return this.checkPeriodOpen(ctx, WindowNo, mTab, mField, value);
  };
  // checkPeriodOpen :217-252
  CalloutEngine.prototype.checkPeriodOpen = function (ctx, WindowNo, mTab, mField, value) {
    if (this.isCalloutActive()) return CalloutEngine.NO_ERROR;
    if (value == null || !(value instanceof Timestamp)) return CalloutEngine.NO_ERROR;
    var orgID = 0;
    if (mTab.getValue('AD_Org_ID') != null) orgID = mTab.getValue('AD_Org_ID');
    var doctypeID = -1;
    if (mTab.getValue('C_DocTypeTarget_ID') != null) doctypeID = mTab.getValue('C_DocTypeTarget_ID');
    else if (mTab.getValue('C_DocType_ID') != null) doctypeID = mTab.getValue('C_DocType_ID');
    var docBase = null;
    if (doctypeID <= 0) {
      if ('M_Inventory' === mTab.getTableName()) docBase = 'MMI';            // Doc.DOCTYPE_MatInventory
      else if ('M_Movement' === mTab.getTableName()) docBase = 'MMM';        // Doc.DOCTYPE_MatMovement
      else if ('M_Requisition' === mTab.getTableName()) docBase = 'POR';     // Doc.DOCTYPE_PurchaseRequisition
    }
    var MPeriod = RUNTIME.M.MPeriod;
    if (doctypeID > 0) MPeriod.testPeriodOpen(ctx, value, doctypeID, orgID);
    else if (docBase != null) MPeriod.testPeriodOpen(ctx, value, docBase, orgID);
    return CalloutEngine.NO_ERROR;
  };
  // rate :263-280
  CalloutEngine.prototype.rate = function (ctx, WindowNo, mTab, mField, value) {
    if (this.isCalloutActive() || value == null) return CalloutEngine.NO_ERROR;
    var rate1 = value, rate2 = Env.ZERO;
    if (rate1.signum() !== 0) rate2 = RUNTIME.M.MUOMConversion.getOppositeRate(rate1);
    if (mField.getColumnName() === 'MultiplyRate') mTab.setValue('DivideRate', rate2);
    else mTab.setValue('MultiplyRate', rate2);
    return CalloutEngine.NO_ERROR;
  };
  CLASSES['org.compiere.model.CalloutEngine'] = CalloutEngine; CLASSES.CalloutEngine = CalloutEngine;

  // LegacyCallout — a plugin bundle's registerHandler(fn(ctx, info)->{derived}) runs as a callout: derived → setValue
  function LegacyCallout(fn) { CalloutEngine.call(this); this.fn = fn; }
  LegacyCallout.prototype = Object.create(CalloutEngine.prototype);
  LegacyCallout.prototype.start = function (ctx, method, WindowNo, mTab, mField, value) {
    var rec = {}; mTab.getFields().forEach(function (f) { rec[f.getColumnName()] = stored(f.getValue()); });
    var out = this.fn({}, { table: mTab.getTableName(), column: mField.getColumnName(), record: rec }) || {};
    var d = out.derived || {};
    Object.keys(d).forEach(function (c) { var f = mTab.getField(c); if (f) mTab.setValue(f, typed(f.getDisplayType(), d[c])); });
    return out.error || '';
  };

  // ══ GridField (M/GridField.java) ══════════════════════════════════════════════════════════════════════════
  function GridField(vo, tab) { this.vo = vo; this.m_gridTab = tab; this.m_value = null; this.m_oldValue = null; this.m_inserting = false; }
  GridField.prototype.getColumnName = function () { return this.vo.ColumnName; };
  GridField.prototype.getValue = function () { return this.m_value; };
  GridField.prototype.getOldValue = function () { return this.m_oldValue; };
  GridField.prototype.getDisplayType = function () { return this.vo.displayType; };
  GridField.prototype.getCallout = function () { return this.vo.Callout || ''; };
  GridField.prototype.isKey = function () { return !!this.vo.IsKey; };
  GridField.prototype.isParentValue = function () { return !!this.vo.IsParent; };
  GridField.prototype.isAlwaysUpdateable = function () { return !!this.vo.IsAlwaysUpdateable; };
  GridField.prototype.isLookup = function () { return DT.isLookup(this.vo.displayType) || this.vo.displayType === DT.Location || this.vo.displayType === DT.Locator || this.vo.displayType === DT.Account || this.vo.displayType === DT.PAttribute; };
  GridField.prototype.getAD_Column_ID = function () { return this.vo.AD_Column_ID; };
  GridField.prototype.getGridTab = function () { return this.m_gridTab; };
  GridField.prototype.getValidation = function () { return this.vo.validation || ''; };
  GridField.prototype.isMandatory = function () { return !!this.vo.IsMandatory; };
  // setValue :2102-2120 (m_valueNoFire is true by default → old value = previous value)
  GridField.prototype.setValue = function (newValue, inserting) {
    this.m_oldValue = this.m_value;
    this.m_value = newValue; this.m_inserting = !!inserting;
    this.updateContext();
  };
  // getDependentOn :305-327
  GridField.prototype.getDependentOn = function () {
    var list = [];
    parseDepends(list, this.vo.DisplayLogic); parseDepends(list, this.vo.ReadOnlyLogic); parseDepends(list, this.vo.MandatoryLogic);
    if (this.isLookup()) parseDepends(list, this.vo.validation);
    return list;
  };
  // updateContext :2122-2175
  GridField.prototype.updateContext = function () {
    var dt = this.vo.displayType, t = this.m_gridTab;
    if (dt === DT.Text || dt === DT.Memo || dt === DT.TextLong || dt === DT.JSON || dt === DT.Binary || dt === DT.RowID || this.vo.IsEncrypted) return;
    var ctx = t.ctx, w = t.windowNo, n = this.vo.ColumnName, v = this.m_value;
    var updWin = !this.isParentTabField() && t.isUpdateWindowContext();
    if (typeof v === 'boolean') {
      if (updWin) Env.setContext(ctx, w, n, v);
      Env.setContext(ctx, w, t.tabNo, n, v == null ? null : (v ? 'Y' : 'N'));
    } else if (v instanceof Timestamp) {
      if (updWin) Env.setContext(ctx, w, n, v);
      Env.setContext(ctx, w, t.tabNo, n, v.toString());
    } else {
      if (updWin) Env.setContext(ctx, w, n, v == null ? null : String(stored(v)));
      Env.setContext(ctx, w, t.tabNo, n, v == null ? null : String(stored(v)));
    }
  };
  GridField.prototype.isParentTabField = function () {            // :2664-2684
    var p = this.m_gridTab.getParentTab();
    while (p) { if (p.getField(this.vo.ColumnName)) return true; p = p.getParentTab(); }
    return false;
  };
  function parseDepends(list, s) {                               // Evaluator.parseDepends :111-136
    if (s == null || s.length === 0) return;
    while (s.indexOf('@') !== -1) {
      var pos = s.indexOf('@'); s = s.substring(pos + 1); pos = s.indexOf('@');
      if (pos === -1) continue;
      var v = s.substring(0, pos); s = s.substring(pos + 1);
      if (v.charAt(0) === '~') v = v.substring(1);
      v = v.replace(/[0-9][0-9]*\|/, '');
      if (v.indexOf('.') > 0) v = v.substring(0, v.indexOf('.'));
      if (v.indexOf(':') > 0) v = v.substring(0, v.indexOf(':'));
      list.push(v);
    }
  }

  // ══ GridTab row model (M/GridTab.java + M/GridTable.java) ═══════════════════════════════════════════════
  //   opts: { ctx, db, windowNo, tabNo, tableName, AD_Table_ID, fields:[vo], parentTab, onSet(col, stored, typed),
  //           onError(msg), lookupContains(field, value) → true|false|null }
  var ZERO_ID_TABLES = ['AD_Org', 'AD_OrgInfo', 'AD_Client', 'AD_ClientInfo', 'AD_AllClients_V', 'AD_ReportView', 'AD_Role',
    'AD_AllRoles_V', 'AD_System', 'AD_AllUsers_V', 'C_DocType', 'GL_Category', 'M_AttributeSet', 'M_AttributeSetInstance'];   // MTable.isZeroIDTable :1019-1033
  function GridTab(o) {
    this.ctx = o.ctx; this.windowNo = o.windowNo; this.tabNo = o.tabNo || 0; this.tableName = o.tableName;
    this.AD_Table_ID = o.AD_Table_ID; this.AD_Tab_ID = o.AD_Tab_ID; this.parentTab = o.parentTab || null; this.opts = o;
    this.fields = []; this.byName = {}; this.activeCallouts = []; this.inserting = false; this.updateWindowContext = true;
    this.trace = []; this.msgs = []; this.recordId = o.recordId || null;
    var self = this;
    (o.fields || []).forEach(function (vo) { var f = new GridField(vo, self); self.fields.push(f); self.byName[vo.ColumnName.toLowerCase()] = f; });
  }
  GridTab.prototype.getField = function (c) { if (c instanceof GridField) return c; return c == null ? null : (this.byName[String(c).toLowerCase()] || null); };
  GridTab.prototype.getFields = function () { return this.fields; };
  GridTab.prototype.getFieldCount = function () { return this.fields.length; };
  GridTab.prototype.getTableName = function () { return this.tableName; };
  GridTab.prototype.getAD_Table_ID = function () { return this.AD_Table_ID; };
  GridTab.prototype.getAD_Tab_ID = function () { return this.AD_Tab_ID; };
  GridTab.prototype.getTabNo = function () { return this.tabNo; };
  // get_ValueAsString :1596-1610 (DefaultEvaluatee over the window/tab context) — FORK E additive
  GridTab.prototype.get_ValueAsString = function (name) { return Env.getContext(this.ctx, this.windowNo, this.tabNo, name) || ''; };
  // fireDataStatusEEvent :2487-2490 — a UI status event (no field); logged, kept on the tab for the host to show
  GridTab.prototype.fireDataStatusEEvent = function (AD_Message, info, isError) {
    (this.statusEvents = this.statusEvents || []).push({ msg: AD_Message, info: info, isError: !!isError });
    RUNTIME.log('§CALLOUT-STATUS-EVENT ' + this.tableName + ' ' + AD_Message + ' ' + (info == null ? '' : info) + (isError ? ' (error)' : ''));
  };
  GridTab.prototype.getWindowNo = function () { return this.windowNo; };
  GridTab.prototype.getParentTab = function () { return this.parentTab; };
  GridTab.prototype.isUpdateWindowContext = function () { return this.updateWindowContext; };
  GridTab.prototype.isInserting = function () { return this.inserting; };
  GridTab.prototype.getActiveCallouts = function () { return this.activeCallouts.slice(); };
  GridTab.prototype.getKeyColumnName = function () { var k = this.fields.filter(function (f) { return f.isKey(); })[0]; return k ? k.getColumnName() : null; };
  GridTab.prototype.getRecord_ID = function () { var k = this.getKeyColumnName(); if (!k) return -1; var v = this.getValue(k); return v == null ? -1 : v; };
  GridTab.prototype.getValue = function (c) { var f = this.getField(c); return f ? f.getValue() : null; };
  GridTab.prototype.getValueAsBoolean = function (c) { var v = this.getValue(c); return v === true || v === 'Y'; };
  GridTab.prototype.isProcessed = function () { return this.getValueAsBoolean('Processed'); };
  GridTab.prototype.isActive = function () { return this.getValueAsBoolean('IsActive'); };
  GridTab.prototype.getContext = function (name) { return Env.getContext(this.ctx, this.windowNo, this.tabNo, name); };
  // load(row, inserting) — GridTable.readData + setCurrentRow: every field takes the row's value (no callouts), ctx updated
  GridTab.prototype.load = function (row, inserting) {
    var r = {}; for (var k in (row || {})) if (Object.prototype.hasOwnProperty.call(row, k)) r[String(k).toLowerCase()] = row[k];
    this.inserting = !!inserting;
    // inserting = GridTable.dataNew :2129-2143 — ONE pass in field order: a column the host gave keeps its value, every other
    //   column takes GridField.getDefault() evaluated against the context AS IT STANDS (earlier fields already in it, the window's
    //   own keys such as IsSOTrx not yet overwritten), then updateContext. A separate "load nulls, then default" pass wiped them.
    var defs = this.lastDefaults = {}, self = this;
    this.fields.forEach(function (f) {
      var cn = f.getColumnName(), raw = r[cn.toLowerCase()], v;
      var dflt = inserting && (raw == null || String(raw) === '');
      // GridTable.dataNew :2134-2137 "avoid getting default from previous row": the TAB-level key goes; the WINDOW-level one stays,
      //   so @Col@ defaults read the record that was current when New was pressed (ZK opens a window on its newest row)
      if (dflt && self.ctx && self.ctx.remove) self.ctx.remove(self.windowNo + '|' + self.tabNo + '|' + cn);
      if (dflt) { v = f.getDefault(); if (v != null) v = typed(f.getDisplayType(), v); }
      else v = typed(f.getDisplayType(), raw);
      f.m_oldValue = null; f.m_value = v; f.m_inserting = !!inserting; f.updateContext();
      if (dflt && v != null && !self.validateValueNoDirect(f)) { f.m_value = null; f.updateContext(); }
      if (dflt && f.m_value != null) defs[cn] = stored(f.m_value);
    });
    return this;
  };
  // ── GridField.getDefault (M/GridField.java:627-1110), priority DEFAULT_PRIORITY_ORDER "123457" (:98):
  //   1 special case · 2 @SQL= · 3 DefaultValue expression · 4 user preference · 5 system preference · 7 data type.
  GridField.prototype.isIgnoreDefault = function () {                                   // :724-731
    var dt = this.vo.displayType, cn = this.vo.ColumnName;
    return this.vo.IsKey || dt === DT.RowID || dt === DT.Binary || dt === DT.Image || dt === DT.TextLong || cn === 'Created' || cn === 'Updated';
  };
  GridField.prototype.createDefault = function (value) {                                // :1065-1131
    if (value == null || String(value).length === 0 || String(value).toUpperCase() === 'NULL') return null;
    var cn = this.vo.ColumnName, dt = this.vo.displayType;
    try {
      if (/atedBy$/.test(cn) || (/_ID$/.test(cn) && DT.isID(dt))) {                    // defaults -1 => null
        var ii = parseInt(String(value), 10); if (isNaN(ii) || String(ii) !== String(value).trim()) return 0;
        return ii < 0 ? null : ii;
      }
      if (dt === DT.Integer) return parseInt(String(value), 10);
      if (DT.isNumeric(dt)) return BD.fromString(String(value).trim());
      if (DT.isDate(dt)) return Timestamp.of(value);
      if (dt === DT.YesNo) return String(value) === 'Y';
      return String(value);
    } catch (e) { RUNTIME.log('§GRIDFIELD-DEFAULT ' + cn + ' createDefault failed: ' + (e && e.message)); return null; }
  };
  GridField.prototype.defaultForSpecialCase = function () {                             // :733-751
    var vo = this.vo, t = this.m_gridTab, cn = vo.ColumnName;
    if (this.isParentValue() && (vo.DefaultValue == null || vo.DefaultValue.length === 0))  // defaultFromParent :753-765
      return this.createDefault(Env.getContext(t.ctx, t.windowNo, cn));
    if (cn === 'IsActive') return true;                                                 // defaultForActiveField :767-775 ("Y")
    var al = t.opts.accessLevel;                                                        // defaultForClientOrg :777-795 (GridTab.CTX_AccessLevel)
    if (al === '4' && (cn === 'AD_Client_ID' || cn === 'AD_Org_ID')) return 0;         // ACCESSLEVEL_SystemOnly
    if (al === '6' && cn === 'AD_Org_ID') return 0;                                     // ACCESSLEVEL_SystemPlusClient
    return null;
  };
  GridField.prototype.defaultFromSQLExpression = function () {                          // :797-842
    var dv = this.vo.DefaultValue, t = this.m_gridTab;
    if (dv == null || dv.indexOf('@SQL=') !== 0) return null;
    var sql = Env.parseContext(t.ctx, t.windowNo, undefined, dv.substring(5), false, false);
    if (sql === '') { RUNTIME.log('§GRIDFIELD-DEFAULT (' + this.vo.ColumnName + ') - Default SQL variable parse failed: ' + dv); return null; }
    var defStr = '';
    try { var r = RUNTIME.DB.query(sql, [])[0]; if (r) { var k = Object.keys(r)[0]; defStr = r[k] == null ? '' : String(r[k]); } }
    catch (e) { RUNTIME.log('§GRIDFIELD-DEFAULT (' + this.vo.ColumnName + ') ' + sql + ' — ' + (e && e.message)); }
    return defStr.length > 0 ? this.createDefault(defStr) : null;
  };
  GridField.prototype.defaultFromExpression = function () {                             // :844-882
    var dv = this.vo.DefaultValue, t = this.m_gridTab;
    if (dv == null || dv === '' || dv.indexOf('@SQL=') === 0) return null;
    var toks = dv.split(/[,;]/).filter(function (x) { return x.length > 0; });           // StringTokenizer(",;", false)
    for (var i = 0; i < toks.length; i++) {
      var defStr = toks[i].trim();
      if (defStr === '@SysDate@') return new Timestamp(RUNTIME.now());
      else if (defStr.indexOf('@') !== -1) defStr = Env.parseContext(t.ctx, t.windowNo, t.tabNo, defStr.trim(), false, false);
      else if (defStr.indexOf("'") !== -1) defStr = defStr.replace(/'/g, ' ').trim();
      if (defStr !== '') return this.createDefault(defStr);
    }
    return null;
  };
  GridField.prototype.defaultFromPreference = function (type) {                         // :987-1020 + Env.getPreference
    var ctx = this.m_gridTab.ctx, cn = this.vo.ColumnName, w = this.m_gridTab.opts.AD_Window_ID || 0, v;
    if (type === '4') { v = ctx.getProperty('P' + w + '|' + cn); if (v == null) v = ctx.getProperty('P|' + cn); }
    else { v = ctx.getProperty('#' + cn); if (v == null) v = ctx.getProperty('$' + cn); if (v == null) v = ctx.getProperty('+' + cn); }
    return (v == null || v === '') ? null : this.createDefault(String(v));
  };
  GridField.prototype.defaultFromDatatype = function () {                               // :1022-1051 (order is load-bearing)
    var dt = this.vo.displayType, cn = this.vo.ColumnName;
    if (dt === DT.Button && !/_ID$/.test(cn)) return 'N';
    if (dt === DT.YesNo) return false;                                                  // "N"
    if (/_ID$/.test(cn)) return null;
    if (DT.isNumeric(dt)) return this.createDefault('0');
    return null;
  };
  GridField.prototype.getDefault = function () {                                        // :627-722
    if (this.isIgnoreDefault()) return null;
    var seq = '123457', v = null;
    for (var i = 0; i < seq.length; i++) {
      var c = seq.charAt(i);
      if (c === '3' && this.vo.DefaultValue != null && this.vo.DefaultValue.toUpperCase() === 'NULL') return null;   // IDEMPIERE-2678
      v = c === '1' ? this.defaultForSpecialCase() : c === '2' ? this.defaultFromSQLExpression() : c === '3' ? this.defaultFromExpression()
        : (c === '4' || c === '5') ? this.defaultFromPreference(c) : c === '7' ? this.defaultFromDatatype() : null;
      if (v != null) return v;
    }
    return v;
  };
  // setValue :2849-2885 (+ GridTable.setValueAt :1387-1440 + ADTabpanel.dataStatusChanged :1692-1712)
  GridTab.prototype.setValue = function (field, value) {
    if (typeof field === 'string') { if (field == null) return 'NoColumn'; field = this.getField(field); }
    if (field == null) return 'NoField';
    var dt = field.getDisplayType();
    if (value !== null && value !== undefined && !(value instanceof BD) && !(value instanceof Timestamp) && typeof value !== 'boolean') value = typed(dt, value);
    if (value === undefined) value = null;
    if (typeof value === 'number' && Number.isInteger(value)) {
      if (value < 0 && DT.isID(dt)) value = null;
      else if (value === 0 && field.isLookup()) { if (ZERO_ID_TABLES.indexOf(field.vo.refTable || '') < 0) value = null; }
    }
    var oldValue = field.getValue();
    if (!isValueChanged(oldValue, value)) return '';
    field.setValue(value, this.inserting);
    if (this.opts.onSet) try { this.opts.onSet(field.getColumnName(), stored(value), value); } catch (e) {}
    this._dataStatusChanged(field);
    return '';
  };
  GridTab.prototype._dataStatusChanged = function (mField) {
    if (mField && (mField.getCallout().length > 0 || findColumnCallouts(this.tableName, mField.getColumnName()).length > 0 || this.hasDependants(mField.getColumnName()))) {
      this.trace.push(mField.getColumnName() + '=' + stored(mField.getValue()));
      var msg = this.processFieldChange(mField);
      if (msg && msg.length > 0) { this.msgs.push(mField.getColumnName() + ':' + msg); if (this.opts.onError) try { this.opts.onError(msg, mField.getColumnName()); } catch (e) {} }
    }
  };
  function isEmptyVal(v) { return v != null && typeof v === 'string' && v.length === 0; }
  function isValueChanged(o, v) {                                 // GridTable.isValueChanged :3581-3620
    if (isEmptyVal(o)) o = null; if (isEmptyVal(v)) v = null;
    var ch = (o == null && v != null) || (o != null && v == null);
    if (!ch && o != null) {
      if (o instanceof BD && v instanceof BD) ch = o.compareTo(v) !== 0;
      else if (o instanceof Timestamp && v instanceof Timestamp) ch = o.compareTo(v) !== 0;
      else if (typeof o === typeof v) ch = o !== v;
      else ch = String(stored(o)) !== String(stored(v));
    }
    return ch;
  }
  GridTab.prototype.hasDependants = function (col) {
    var lc = String(col).toLowerCase();
    return this.fields.some(function (f) { return f.getDependentOn().some(function (d) { return d.toLowerCase() === lc; }); });
  };
  GridTab.prototype.getDependantFields = function (col) {
    var lc = String(col).toLowerCase();
    return this.fields.filter(function (f) { return f.getDependentOn().some(function (d) { return d.toLowerCase() === lc; }); });
  };
  // processFieldChange :2912-2916
  GridTab.prototype.processFieldChange = function (changedField) { this.processDependencies(changedField); return this.processCallout(changedField); };
  // processDependencies :2922-2948 + GridField.updateDependentField :2874-2910 (lookup re-validation)
  GridTab.prototype.processDependencies = function (changedField) {
    var columnName = changedField.getColumnName(), self = this;
    if (!this.hasDependants(columnName)) return;
    this.getDependantFields(columnName).forEach(function (dep) {
      if (!dep.isLookup() || !dep.getValidation()) return;
      var re = new RegExp('@(?:~|' + self.tabNo + '\\|)?' + columnName + '(:.+)?@');
      if (!re.test(dep.getValidation())) return;
      var currentValue = dep.getValue();
      self.setValue(dep, null);
      if (currentValue != null) {
        var has = self.lookupContains(dep, currentValue);
        if (has) self.setValue(dep, currentValue);
      }
    });
  };
  // GridField.validateValueNoDirect (M/GridField.java:1133-1225), run by GridTable.dataNew on each default (:2140): a lookup value its
  //   refreshed, validated list does not hold is cleared — keys/parents exempt, AD_Client_ID 0 exempt for System (IDEMPIERE-2781).
  //   Search (not cached) is judged by getDirect = the row exists, no validation. Returns false when the value was rejected.
  GridTab.prototype.validateValueNoDirect = function (field) {
    var v = field.getValue();
    if (v == null || String(v).length === 0) return true;
    var dt = field.getDisplayType();
    if (dt === DT.Search && field.vo.refTable) {
      try { return RUNTIME.DB.query('SELECT 1 AS x FROM ' + field.vo.refTable + ' WHERE ' + field.vo.refKey + '=?', [v]).length > 0; } catch (e) { return true; }
    }
    if (!field.isLookup()) return true;
    if (this.lookupContains(field, v)) return true;
    if (field.isKey() || field.isParentValue()) return true;
    if (field.getColumnName() === 'AD_Client_ID' && String(v) === '0' && Env.getAD_Client_ID(this.ctx) === 0) return true;
    RUNTIME.log('§GRIDFIELD-VALIDATE ' + this.tableName + '.' + field.getColumnName() + '=' + v + ' not in validated lookup → null (GridField.validateValueNoDirect)');
    return false;
  };
  GridTab.prototype.lookupContains = function (field, value) {
    if (this.opts.lookupContains) { var r = this.opts.lookupContains(this, field, value); if (r === true || r === false) return r; }
    return RUNTIME.lookupContains(this, field, value);
  };
  // processCallout :2988-3170
  GridTab.prototype.processCallout = function (field) {
    if (this.isProcessed() && !field.isAlwaysUpdateable() && !field.isKey()) return '';
    var value = field.getValue(), oldValue = field.getOldValue(), callout = field.getCallout(), self = this;
    if (callout.length > 0) {
      var list = callout.split(/[;,]/).map(function (s) { return s.trim(); }).filter(Boolean);
      for (var i = 0; i < list.length; i++) {
        var cmd = list[i];
        if (this.activeCallouts.indexOf(cmd) >= 0) continue;                    // detect infinite loop
        if (/^@script:/i.test(cmd)) { RUNTIME.log('§CALLOUT-UNPORTED-DEP ' + cmd + ' (JSR223 MRule script)'); continue; }
        var ms = cmd.lastIndexOf('.'), call = null, method = null;
        if (ms !== -1) { method = cmd.substring(ms + 1); call = getCallout(cmd.substring(0, ms), method); }
        if (call == null) { RUNTIME.unported(cmd, this.tableName, field.getColumnName()); continue; }
        var retValue = '';
        this.activeCallouts.push(cmd);
        try { retValue = call.start(this.ctx, method, this.windowNo, this, field, value, oldValue); }
        catch (e) { retValue = 'Callout Invalid: ' + ((e && e.message) || e); }
        finally { var ix = this.activeCallouts.lastIndexOf(cmd); if (ix >= 0) this.activeCallouts.splice(ix, 1); }
        RUNTIME.fired(cmd, this.tableName, field.getColumnName());
        if (retValue && retValue.length) return retValue;                          // interrupt on first error
      }
    }
    var cos = findColumnCallouts(this.tableName, field.getColumnName());
    for (var j = 0; j < cos.length; j++) {
      var co = cos[j];
      if (this.activeCallouts.indexOf(co.name) >= 0) continue;
      var rv = '';
      this.activeCallouts.push(co.name);
      try { rv = co.start(this.ctx, this.windowNo, this, field, value, oldValue); }
      catch (e2) { rv = 'Callout Invalid: ' + ((e2 && e2.message) || e2); }
      finally { var jx = this.activeCallouts.lastIndexOf(co.name); if (jx >= 0) this.activeCallouts.splice(jx, 1); }
      RUNTIME.fired(co.name, this.tableName, field.getColumnName());
      if (rv && rv.length) return rv;
    }
    return '';
  };
  // dataNew fan :1179-1181 — after the defaults are in, EVERY field's callouts run once, in field order
  GridTab.prototype.dataNewCallouts = function () {
    for (var i = 0; i < this.getFieldCount(); i++) {
      var msg = this.processCallout(this.fields[i]);
      if (msg) this.msgs.push(this.fields[i].getColumnName() + ':' + msg);
    }
  };
  GridTab.prototype.snapshot = function () { var o = {}; this.fields.forEach(function (f) { o[f.getColumnName()] = stored(f.getValue()); }); return o; };

  // ══ RUNTIME — what a ported callout body sees (bound per host session by bind(query)) ═══════════════════════
  var _stats = { fired: {}, unported: {} };
  var RUNTIME = {
    BD: BD, RM: RM, Env: Env, Msg: Msg, Timestamp: Timestamp, TimeUtil: TimeUtil, DisplayType: DT, typed: typed, stored: stored,
    toBD: toBD, isEmpty: isEmpty, AdempiereException: AdempiereException, CalloutEngine: CalloutEngine,
    DB: null, PO: null, M: {},              // M = model/support classes (erp/callouts/support.js fills it)
    now: function () { return Date.now(); },
    log: function (s) { if (typeof console !== 'undefined') console.log(s); },
    fired: function (cmd) { _stats.fired[cmd] = (_stats.fired[cmd] || 0) + 1; },
    unported: function (cmd, table, col) {
      var first = !_stats.unported[cmd]; _stats.unported[cmd] = (_stats.unported[cmd] || 0) + 1;
      if (first) RUNTIME.log('§CALLOUT-UNPORTED ' + cmd + ' on ' + table + '.' + col + ' (no ported class/method — skipped, chain continues)');
    },
    unportedDep: function (where, what) { RUNTIME.log('§CALLOUT-UNPORTED-DEP ' + where + ' needs ' + what); },
    stats: function () { return JSON.parse(JSON.stringify(_stats)); },
    // lookupContains — MLookup.containsKeyNoDirect :300-311 over the field's own reference + validation
    lookupContains: function (tab, field, value) {
      var vo = field.vo, dt = vo.displayType, val = vo.validation || '', where = '';
      if (val) { where = Env.parseContext(tab.ctx, tab.windowNo, tab.tabNo, val, false, false, true); if (!where) return false; }
      try {
        if (dt === DT.List) {
          return RUNTIME.DB.query('SELECT 1 FROM ad_ref_list WHERE ad_reference_id=? AND value=?' + (where ? ' AND (' + where + ')' : ''), [vo.AD_Reference_Value_ID, stored(value)]).length > 0;
        }
        if (vo.refTable && vo.refKey) {
          var w2 = vo.refWhere ? Env.parseContext(tab.ctx, tab.windowNo, tab.tabNo, vo.refWhere, false, false, true) : '';
          return RUNTIME.DB.query('SELECT 1 FROM ' + vo.refTable + ' WHERE ' + vo.refTable + '.' + vo.refKey + '=?' +
            (where ? ' AND (' + where + ')' : '') + (w2 ? ' AND (' + w2 + ')' : ''), [stored(value)]).length > 0;
        }
      } catch (e) { RUNTIME.unportedDep('lookupContains ' + tab.tableName + '.' + vo.ColumnName, 'SQL ' + ((e && e.message) || e)); return true; }
      return true;
    }
  };
  function bind(query, opts) {
    RUNTIME.DB = makeDB(query); RUNTIME.PO = makePO(RUNTIME.DB);
    if (opts && opts.now) RUNTIME.now = opts.now;
    Env.now = RUNTIME.now;
    if (opts && opts.log) RUNTIME.log = opts.log;
    return RUNTIME;
  }

  // fieldsFor(AD_Tab_ID) — GridFieldVO.getSQL (AD_Field_v, ORDER BY IsDisplayed DESC, SeqNo) from the dictionary
  function fieldsFor(AD_Tab_ID) {
    var rows = RUNTIME.DB.query(
      'SELECT c.ColumnName AS cn, COALESCE(f.AD_Reference_ID, c.AD_Reference_ID) AS dt, COALESCE(f.AD_Reference_Value_ID, c.AD_Reference_Value_ID) AS rv, ' +
      'COALESCE(f.AD_Val_Rule_ID, c.AD_Val_Rule_ID) AS vr, c.Callout AS co, c.IsKey AS k, c.IsParent AS p, ' +
      "CASE WHEN f.IsAlwaysUpdateable='Y' OR c.IsAlwaysUpdateable='Y' THEN 'Y' ELSE 'N' END AS au, c.AD_Column_ID AS cid, " +
      'f.DisplayLogic AS dl, COALESCE(f.ReadOnlyLogic, c.ReadOnlyLogic) AS rl, COALESCE(f.MandatoryLogic, c.MandatoryLogic) AS ml, ' +
      'COALESCE(f.IsMandatory, c.IsMandatory) AS mand, c.IsEncrypted AS enc, f.IsDisplayed AS disp, f.SeqNo AS seq, COALESCE(f.DefaultValue, c.DefaultValue) AS dv ' +
      "FROM AD_Field f JOIN AD_Column c ON c.AD_Column_ID=f.AD_Column_ID WHERE f.AD_Tab_ID=? AND f.IsActive='Y' AND c.IsActive='Y' " +
      'ORDER BY f.IsDisplayed DESC, f.SeqNo', [AD_Tab_ID]);
    var vrCache = {};
    return rows.map(function (r) {
      var dt = Number(r.dt), vo = { ColumnName: r.cn, displayType: dt, AD_Reference_Value_ID: r.rv == null ? null : Number(r.rv),
        Callout: r.co || '', IsKey: r.k === 'Y', IsParent: r.p === 'Y', IsAlwaysUpdateable: r.au === 'Y', AD_Column_ID: Number(r.cid),
        DisplayLogic: r.dl || '', ReadOnlyLogic: r.rl || '', MandatoryLogic: r.ml || '', IsMandatory: r.mand === 'Y', IsEncrypted: r.enc === 'Y',
        IsDisplayed: r.disp === 'Y', DefaultValue: r.dv == null ? null : String(r.dv), validation: '' };
      if (r.vr != null) {
        if (!(r.vr in vrCache)) { var v = RUNTIME.DB.query('SELECT code FROM ad_val_rule WHERE ad_val_rule_id=?', [r.vr])[0]; vrCache[r.vr] = v ? (v.code || '') : ''; }
        vo.validation = vrCache[r.vr];
      }
      // reference table (MColumn.getReferenceTableName :874 / MLookupFactory): TableDir → ColumnName-"_ID"; Table/Search via AD_Ref_Table
      if (dt === DT.TableDir || ((dt === DT.Search || dt === DT.Table) && vo.AD_Reference_Value_ID == null)) {
        vo.refTable = r.cn.replace(/_ID$/i, ''); vo.refKey = r.cn;
      } else if ((dt === DT.Table || dt === DT.Search) && vo.AD_Reference_Value_ID != null) {
        var rt = RUNTIME.DB.query('SELECT t.TableName AS t, k.ColumnName AS k, rt.WhereClause AS w FROM AD_Ref_Table rt JOIN AD_Table t ON t.AD_Table_ID=rt.AD_Table_ID ' +
          'JOIN AD_Column k ON k.AD_Column_ID=rt.AD_Key WHERE rt.AD_Reference_ID=?', [vo.AD_Reference_Value_ID])[0];
        if (rt) { vo.refTable = rt.t; vo.refKey = rt.k; vo.refWhere = rt.w || ''; }
      } else if (dt === DT.Location) { vo.refTable = 'C_Location'; vo.refKey = 'C_Location_ID'; }
      else if (dt === DT.Locator) { vo.refTable = 'M_Locator'; vo.refKey = 'M_Locator_ID'; }
      else if (dt === DT.Account) { vo.refTable = 'C_ValidCombination'; vo.refKey = 'C_ValidCombination_ID'; }
      else if (dt === DT.PAttribute) { vo.refTable = 'M_AttributeSetInstance'; vo.refKey = 'M_AttributeSetInstance_ID'; }
      return vo;
    });
  }
  // openTab(AD_Tab_ID, opts) — a GridTab over the tab's dictionary fields (opts: ctx, windowNo, tabNo, parentTab, onSet, onError)
  function openTab(AD_Tab_ID, opts) {
    var t = RUNTIME.DB.query('SELECT t.AD_Table_ID AS tid, tb.TableName AS tn, t.SeqNo AS seq, t.AD_Window_ID AS wid, tb.AccessLevel AS al FROM AD_Tab t JOIN AD_Table tb ON tb.AD_Table_ID=t.AD_Table_ID WHERE t.AD_Tab_ID=?', [AD_Tab_ID])[0];
    if (!t) return null;
    var o = {}; for (var k in (opts || {})) o[k] = opts[k];
    o.AD_Tab_ID = AD_Tab_ID; o.AD_Table_ID = Number(t.tid); o.tableName = t.tn; o.fields = fieldsFor(AD_Tab_ID);
    o.AD_Window_ID = t.wid == null ? 0 : Number(t.wid); o.accessLevel = t.al == null ? '' : String(t.al);
    return new GridTab(o);
  }

  // loginContext — Login.loadPreferences (U/Login.java:477-640) + loadDefault (:650-690): the #/$/P| context a session carries.
  function loginContext(o) {
    var ctx = new Ctx(), DB = RUNTIME.DB;
    Env.setContext(ctx, Env.AD_CLIENT_ID, o.client); Env.setContext(ctx, Env.AD_ORG_ID, o.org);
    Env.setContext(ctx, Env.AD_ROLE_ID, o.role); Env.setContext(ctx, Env.AD_USER_ID, o.user);
    Env.setContext(ctx, '#AD_Language', o.language || 'en_US');
    if (o.wh != null) Env.setContext(ctx, Env.M_WAREHOUSE_ID, o.wh); else Env.setContext(ctx, Env.M_WAREHOUSE_ID, '');
    Env.setContext(ctx, Env.DATE, o.date ? Timestamp.of(o.date) : new Timestamp(RUNTIME.now()));
    Env.setContext(ctx, '#Printer', '');
    Env.setContext(ctx, '#YYYY', 'Y');
    Env.setContext(ctx, '#StdPrecision', 2);
    var as = DB.query('SELECT a.C_AcctSchema_ID AS a, a.C_Currency_ID AS c, a.HasAlias AS h FROM C_AcctSchema a, AD_ClientInfo c WHERE a.C_AcctSchema_ID=c.C_AcctSchema1_ID AND c.AD_Client_ID=?', [o.client])[0];
    var asId = 0;
    if (as) { asId = Number(as.a); Env.setContext(ctx, '$C_AcctSchema_ID', asId); Env.setContext(ctx, '$C_Currency_ID', Number(as.c)); Env.setContext(ctx, '$HasAlias', as.h); }
    DB.query("SELECT ElementType AS e FROM C_AcctSchema_Element WHERE C_AcctSchema_ID=? AND IsActive='Y'", [asId]).forEach(function (r) { Env.setContext(ctx, '$Element_' + r.e, 'Y'); });
    DB.query("SELECT Attribute AS a, Value AS v, AD_Window_ID AS w, AD_Process_ID AS p, AD_InfoWindow_ID AS i, PreferenceFor AS f FROM AD_Preference " +
      "WHERE AD_Client_ID IN (0, ?) AND AD_Org_ID IN (0, ?) AND (AD_User_ID IS NULL OR AD_User_ID=0 OR AD_User_ID=?) AND IsActive='Y' " +
      'ORDER BY Attribute, AD_Client_ID, AD_User_ID DESC, AD_Org_ID', [o.client, o.org, o.user]).forEach(function (r) {
      var at = '', w = r.w == null ? 0 : Number(r.w);
      if (r.f === 'W') at = r.w == null ? 'P|' + r.a : 'P' + w + '|' + r.a;
      else if (r.f === 'P') at = 'P' + w + '|' + (Number(r.i) || 0) + '|' + (Number(r.p) || 0) + '|' + r.a;
      else if (r.f === 'I') at = 'P' + w + '|' + (Number(r.i) || 0) + '|' + r.a;
      Env.setContext(ctx, at, r.v);
    });
    var orgs = o.userOrgs || [0, o.org];
    DB.query("SELECT t.TableName AS t, c.ColumnName AS c FROM AD_Column c INNER JOIN AD_Table t ON (c.AD_Table_ID=t.AD_Table_ID) WHERE c.IsKey='Y' AND t.IsActive='Y' AND t.IsView='N' " +
      "AND EXISTS (SELECT * FROM AD_Column cc WHERE ColumnName = 'IsDefault' AND t.AD_Table_ID=cc.AD_Table_ID AND cc.IsActive='Y')").forEach(function (r) {
      var T = r.t;
      if (/^AD_Window/.test(T) || /^AD_PrintFormat/.test(T) || /^AD_Workflow/.test(T) || T === 'AD_StorageProvider' || /^M_Locator/.test(T)) return;
      var v;
      try { var x = DB.query('SELECT ' + r.c + ' AS v FROM ' + T + " WHERE IsDefault='Y' AND IsActive='Y' AND AD_Client_ID IN (0," + Number(o.client) + ') AND AD_Org_ID IN (' + orgs.map(Number).join(',') + ') ORDER BY AD_Client_ID DESC, AD_Org_ID DESC, ' + r.c)[0]; v = x ? x.v : null; }
      catch (e) { return; }                     // table absent from this bundle slice
      if (v != null && String(v).length) { if (T === 'C_DocType') Env.setContext(ctx, '#C_DocTypeTarget_ID', String(v)); else Env.setContext(ctx, '#' + r.c, String(v)); }
    });
    // MCountry.getDefault → loadDefaultCountry (M/MCountry.java:174-202): the country of the client's AD_Language, else USA (100)
    var ctry = null;
    try { ctry = DB.query('SELECT c.C_Country_ID AS c FROM C_Country c JOIN AD_Language l ON l.CountryCode=c.CountryCode JOIN AD_Client cl ON cl.AD_Language=l.AD_Language WHERE cl.AD_Client_ID=? ORDER BY c.C_Country_ID', [o.client])[0]; } catch (e) {}
    Env.setContext(ctx, '#C_Country_ID', ctry ? Number(ctry.c) : 100);
    return ctx;
  }

  // coverageScan — X/N of AD_Column.Callout rows (optionally on a table set) whose EVERY ';'-callout has a ported method
  function coverageScan(tables) {
    var where = tables && tables.length ? ' AND lower(t.TableName) IN (' + tables.map(function (t) { return "'" + String(t).toLowerCase() + "'"; }).join(',') + ')' : '';
    var rows = RUNTIME.DB.query("SELECT t.TableName AS t, c.ColumnName AS c, c.Callout AS co FROM AD_Column c JOIN AD_Table t ON t.AD_Table_ID=c.AD_Table_ID WHERE c.Callout IS NOT NULL AND c.Callout<>'' AND c.IsActive='Y'" + where);
    var distinct = {}, full = 0, any = 0, missing = [];
    rows.forEach(function (r) {
      var names = String(r.co).split(/[;,]/).map(function (s) { return s.trim(); }).filter(Boolean), ok = 0;
      names.forEach(function (n) { distinct[n] = hasCallout(n); if (distinct[n]) ok++; else missing.push(r.t + '.' + r.c + '=' + n); });
      if (ok === names.length) full++; if (ok > 0) any++;
    });
    var dk = Object.keys(distinct);
    return { rows: rows.length, rowsFull: full, rowsAny: any, distinct: dk.length, distinctPorted: dk.filter(function (k) { return distinct[k]; }).length, missing: missing };
  }

  // legacy plugin seam (plugin_registry ctx.callout.registerHandler) — kept, adapted to the GridTab engine
  function registerHandler(name, fn) { LEGACY[name] = fn; }
  function hasHandler(name) { return !!LEGACY[name] || hasCallout(name); }

  var API = { BigDecimal: BD, RoundingMode: RM, Timestamp: Timestamp, TimeUtil: TimeUtil, DisplayType: DT, Env: Env, Ctx: Ctx,
    Msg: Msg, typed: typed, stored: stored, toBD: toBD, isEmpty: isEmpty, AdempiereException: AdempiereException,
    CalloutEngine: CalloutEngine, GridTab: GridTab, GridField: GridField, RUNTIME: RUNTIME, bind: bind, openTab: openTab,
    fieldsFor: fieldsFor, loginContext: loginContext, defineCallout: defineCallout, defineColumnCallout: defineColumnCallout,
    findColumnCallouts: findColumnCallouts, COLUMN_CALLOUTS: COLUMN_CALLOUTS, getCallout: getCallout, hasCallout: hasCallout, CLASSES: CLASSES,
    coverageScan: coverageScan, registerHandler: registerHandler, hasHandler: hasHandler, REGISTRY: LEGACY,
    registeredNames: function () { return Object.keys(CLASSES).filter(function (k) { return k.indexOf('.') > 0; }); } };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.AdCallout = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
