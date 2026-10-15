// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// ad_find.js — the Find window's query engine (bim-compiler prompts/ERP_DEPTH_FILM.md §UDP-3). Pure: rows in, SQL/code out.
//   Ports, cited:  ZK FindWindow.java  initFind :983-1170 (which fields), cmd_saveSimple :2951-3080 (simple values -> query),
//   appendCode :2858-2877 + parseUserQuery :2360-2395 (AD_UserQuery.Code), cmd_saveAdvanced :2507-2840 (advanced rows, non-EXISTS),
//   addHistoryRestriction :3394-3408;  MQuery.java  OPERATORS :610-624, getWhereClause :1114-1160, Restriction ctor :1680-1720
//   + getSQL :1960-2060 (qualification, ILIKE -> LIKE over UPPER, TO_STRING / TO_DATE).
//   Dialects: 'pg' prints what legacy prints; 'sqlite' prints the same predicate for the twin's SQLite (dates as text literals,
//   case-sensitive LIKE as GLOB because SQLite's LIKE ignores ASCII case while PostgreSQL's does not).
//   Witness: W-UDP3-ENGINE (erp/tests/witness_udp3_find_engine.js) — the same query rebuilt by the REAL MQuery in the pilot JVM.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
(function (global) {
  'use strict';

  var OP = { EQUAL: '=', NOT_EQUAL: '!=', ILIKE: ' ILIKE ', LIKE: ' LIKE ', NOT_LIKE: ' NOT LIKE ', GREATER: '>', GREATER_EQUAL: '>=',
    LESS: '<', LESS_EQUAL: '<=', BETWEEN: ' BETWEEN ', NULL: ' IS NULL ', NOT_NULL: ' IS NOT NULL ' };
  var OPERATORS = [OP.EQUAL, OP.NOT_EQUAL, OP.ILIKE, OP.LIKE, OP.NOT_LIKE, OP.GREATER, OP.GREATER_EQUAL, OP.LESS, OP.LESS_EQUAL, OP.BETWEEN, OP.NULL, OP.NOT_NULL];
  var FIELD_SEP = '<^>', SEGMENT_SEP = '<~>', HISTORY_SEP = '<#>';
  var HISTORY_DAYS = { All: 0, Year: 365, Month: 31, Week: 7, Day: 1 };   // FindWindow.getHistoryDays

  // DisplayType buckets (DisplayType.java isID :249-255, isNumeric :329-333, isDate :465-468, isText :414-428)
  var ID = [13, 18, 19, 30, 21, 31, 25, 33, 35, 32, 53370, 200202], NUMERIC = [12, 22, 37, 11, 29], DATE = [15, 16, 24];
  var TEXT = [10, 14, 36, 200267, 34, 38, 39, 40, 42, 200127, 27, 200128, 200152, 200161, 200162, 200163, 200135, 200231, 200240, 200234, 200233, 200235, 200271];
  function isID(dt) { return ID.indexOf(Number(dt)) >= 0; }
  function isNumeric(dt) { return NUMERIC.indexOf(Number(dt)) >= 0; }
  function isDate(dt) { return DATE.indexOf(Number(dt)) >= 0; }
  function isText(dt) { return TEXT.indexOf(Number(dt)) >= 0; }
  // the Java type a Find editor hands back (what Restriction formats): Integer / BigDecimal / Timestamp / String
  function valueType(f) {
    var dt = Number(f.displayType);
    if (dt === 20) return 'string';                       // YesNo is made a Y/N List in Find (initFind :995-1010) -> String
    if (dt === 11 || isID(dt)) return 'int';
    if (isNumeric(dt)) return 'num';
    if (isDate(dt)) return 'date';
    return 'string';
  }
  // MColumn.isSuggestSelectionColumn(columnName, true) :809-827
  function isSuggestSelectionColumn(c) { return c === 'Value' || c === 'Name' || c === 'DocumentNo' || c === 'Description' || String(c || '').indexOf('Name') !== -1; }
  // FindWindow.isSearchLike :3920-3924
  function isSearchLike(f) { return isText(f.displayType) && !f.columnSQL && (!!f.isSelectionColumn || isSuggestSelectionColumn(f.columnName)); }

  // ── initFind :983-1170 — which fields the Simple tab shows. fields = the tab's active fields (AD_Field_v shape):
  //    { columnName, name, displayType, isSelectionColumn, seqNoSelection, isDisplayed, columnSQL, isEncrypted, isVirtualUI }
  //    opts.isLookupOnlySelection (AD_Tab.IsLookupOnlySelection). Returns { selection: [...], more: [...] } in display order.
  function findFields(fields, opts) {
    opts = opts || {};
    var sel = [], more = [];
    (fields || []).forEach(function (f) {
      if (Number(f.displayType) === 28 && !f.refValueId) return;            // a Button without a reference is not searchable (no editor)
      if (f.isSelectionColumn) sel.push(f);
      else if (!opts.isLookupOnlySelection && (f.isDisplayed || f.isVirtualSearch) && Number(f.displayType) !== 28 && f.columnName !== 'AD_Client_ID') more.push(f);
    });
    if (!sel.length && more.length) {                                      // :1102-1124
      more.forEach(function (f) { if (['Value', 'Name', 'DocumentNo', 'Description'].indexOf(f.columnName) >= 0) sel.push(f); });
      if (!sel.length) {
        var n = 0;
        for (var i = 0; i < more.length && n < 2; i++) {
          var f = more[i];
          if (f.columnName === 'AD_Client_ID' || f.columnName === 'AD_Org_ID' || Number(f.displayType) === 13) continue;
          sel.push(f); n++;
        }
      }
      more = more.filter(function (f) { return sel.indexOf(f) < 0; });
    }
    var key = function (f) { var s = Number(f.seqNoSelection) || 0; return s === 0 ? Infinity : s; };
    sel = sel.map(function (f, i) { return { f: f, i: i }; })                 // Collections.sort is stable: SeqNoSelection, zeroes last
      .sort(function (a, b) { var ka = key(a.f), kb = key(b.f); return ka < kb ? -1 : ka > kb ? 1 : a.i - b.i; })
      .map(function (x) { return x.f; });
    var ok = function (f) { return !f.isVirtualUI; };
    return { selection: sel.filter(ok), more: more.filter(ok) };
  }

  // ── Restriction value cleaning (MQuery.Restriction ctor :1700-1706): a String wrapped in quotes loses the first char and the last TWO.
  function cleanCode(v) {
    if (typeof v === 'string' && v.charAt(0) === "'" && v.charAt(v.length - 1) === "'") { v = v.substring(1); v = v.substring(0, v.length - 2); }
    return v;
  }
  function toString(s) { if (s == null || s === '') return 'NULL'; return "'" + String(s).replace(/'/g, "''") + "'"; }   // DB.TO_STRING :2090
  function tsText(v) {   // java.sql.Timestamp.valueOf / toString shape, milliseconds cut (DB_PostgreSQL.TO_DATE :455-466)
    var s = String(v).replace('T', ' ');
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += ' 00:00:00';
    return s.replace(/\.\d+$/, '').slice(0, 19);
  }
  function literal(v, type, dialect) {
    if (v == null) return 'NULL';
    if (type === 'date') return dialect === 'pg' ? "TO_TIMESTAMP('" + tsText(v) + "','YYYY-MM-DD HH24:MI:SS')" : "'" + tsText(v) + "'";
    if (type === 'int') return String(Math.trunc(Number(v)));
    if (type === 'num') return String(v).trim();
    return toString(cleanCode(String(v)));
  }
  // Restriction.getSQL :1960-2000 — qualify the column with the table (a function wrapper keeps its name, the column inside is qualified)
  function qualify(col, table, isVirtual) {
    if (isVirtual || !table) return col;
    var pos = col.lastIndexOf('(') + 1, end = col.indexOf(')');
    if (end !== -1 && !(pos - 1 === col.indexOf('(') && col.trim().charAt(0) === '(')) return col.substring(0, pos) + table + '.' + col.substring(pos, end) + col.substring(end);
    var lc = col.toLowerCase();
    if (lc.indexOf('select ') >= 0 && lc.indexOf(' from ') > 0) return col;
    return table + '.' + col;
  }
  // like pattern -> GLOB pattern (SQLite, case-sensitive like PostgreSQL's LIKE): % -> *, _ -> ?, GLOB metachars escaped as classes
  function likeToGlob(p) { return String(p).replace(/[[\]*?]/g, function (c) { return '[' + c + ']'; }).replace(/%/g, '*').replace(/_/g, '?'); }

  // collate — PostgreSQL's text ordering on the legacy DB (glibc en_US.utf8, measured on the pilot: datcollate=en_US.utf8, provider libc).
  //   Emulated: level 1-3 on letters/digits/currency signs only (spaces + punctuation + other symbols are IGNORE), then ICU base/accent/
  //   variant; level 4 = position of the ignored chars (they weigh least). W-UDP3-ENGINE C caught SQLite's byte order (TableName >
  //   'MP_AssetMeter_Log': legacy 304 rows, twin 385); measured 20122/20122 adjacent pairs of 8 pilot text columns in PG's order.
  //   The SQLite dialect calls it as the UDF pgcollate(a, b) for string <, <=, >, >=, BETWEEN (equality is byte-equal on both).
  var _cB = null, _cA = null, _cV = null, KEEP = /[\p{L}\p{N}\p{Sc}]/u;
  function _strip(s) { return Array.from(s).filter(function (c) { return KEEP.test(c); }).join(''); }
  function _lvl4(a, b) {
    var A = Array.from(a), B = Array.from(b);
    for (var i = 0; i < Math.min(A.length, B.length); i++) {
      var ia = !KEEP.test(A[i]), ib = !KEEP.test(B[i]);
      if (ia !== ib) return ia ? -1 : 1;
      if (A[i] !== B[i]) return A[i] < B[i] ? -1 : 1;
    }
    return A.length - B.length;
  }
  function collate(a, b) {
    if (a == null || b == null) return null;
    if (!_cB) { _cB = new Intl.Collator('en-US', { sensitivity: 'base' }).compare; _cA = new Intl.Collator('en-US', { sensitivity: 'accent' }).compare; _cV = new Intl.Collator('en-US', { sensitivity: 'variant' }).compare; }
    a = String(a); b = String(b);
    var A = _strip(a), B = _strip(b), r = _cB(A, B) || _cA(A, B) || _cV(A, B) || _lvl4(a, b);
    return r < 0 ? -1 : r > 0 ? 1 : 0;
  }
  // one restriction -> SQL (Restriction.getSQL with the table qualification on, getWhereClause(true))
  function restrictionSQL(r, table, dialect) {
    var col = qualify(r.col, table, r.isVirtual), op = r.op;
    if (op === OP.NULL || op === OP.NOT_NULL) return col + op;
    var upper = r.col.toUpperCase().indexOf('UPPER(') === 0;
    var lit = function (v) { var s = literal(v, r.type, dialect); return (upper && (r.type || 'string') === 'string') ? 'UPPER(' + s + ')' : s; };
    if (op === OP.ILIKE) op = OP.LIKE;                                        // :2022-2025 ILIKE prints LIKE (the column is UPPER-wrapped)
    if (dialect !== 'pg' && (op === OP.LIKE || op === OP.NOT_LIKE) && !upper && (r.type || 'string') === 'string' && r.v != null && String(r.v) !== '') {
      return col + (op === OP.LIKE ? ' GLOB ' : ' NOT GLOB ') + toString(likeToGlob(cleanCode(String(r.v))));
    }
    if (dialect !== 'pg' && (r.type || 'string') === 'string' && [OP.GREATER, OP.GREATER_EQUAL, OP.LESS, OP.LESS_EQUAL, OP.BETWEEN].indexOf(op) >= 0) {
      if (op === OP.BETWEEN) return '(pgcollate(' + col + ',' + lit(r.v) + ')>=0 AND pgcollate(' + col + ',' + lit(r.v2) + ')<=0)';
      return 'pgcollate(' + col + ',' + lit(r.v) + ')' + op + '0';
    }
    var sb = col + op + lit(r.v);
    if (r.op === OP.BETWEEN) sb += ' AND ' + lit(r.v2);
    return sb;
  }
  // MQuery.getWhereClause(true) :1114-1160 over restrictions { col, op, v, v2, type, andOr ('AND'|'OR'|'AND NOT'|'OR NOT'), not, depth }
  function whereOf(table, restrictions, opts) {
    opts = opts || {};
    var dialect = opts.dialect || 'sqlite', sb = '(', depth = 0;
    (restrictions || []).forEach(function (r, i) {
      if (i !== 0) sb += ' ' + (r.andOrSQL || 'AND') + ' ';
      sb += r.not ? ' NOT ' : '';
      for (; depth < (r.depth || 0); depth++) sb += '(';
      sb += r.sql != null ? r.sql : restrictionSQL(r, table, dialect);
      for (; depth > (r.depth || 0); depth--) sb += ')';
    });
    for (; depth > 0; depth--) sb += ')';
    sb += ')';
    return sb;
  }
  function historyClause(table, history, dialect) {   // addHistoryRestriction :3394-3408 — "<Table>.Created >= getDate()-N"
    var n = HISTORY_DAYS[history] || 0; if (!n) return null;
    return dialect === 'pg' ? table + '.Created >= getDate()-' + n : table + ".Created >= datetime('now','localtime','-" + n + " days')";
  }
  function appendCode(code, col, op, v1, v2, andOr, lB, rB, tabUU) {   // :2858-2877
    return (code ? code + SEGMENT_SEP : '') + [col, op, v1, v2, andOr, lB, rB, tabUU].join(FIELD_SEP);
  }
  // java toString of a Find value (what appendCode writes): Timestamp "yyyy-mm-dd hh:mm:ss.f", Integer, BigDecimal plain, String
  function codeValue(v, type) {
    if (v == null) return '';
    if (type === 'date') { var s = tsText(v); return s + '.0'; }
    if (type === 'int') return String(Math.trunc(Number(v)));
    return String(v);
  }

  // ── cmd_saveSimple :2951-3080. sel = the Simple-tab fields; values = { ColumnName: v | {v, vTo, ge} } (ge = the To-flag :3049-3052).
  //    Returns { restrictions, code, where } (where needs opts.table; history via opts.history).
  function simpleQuery(sel, values, opts) {
    opts = opts || {};
    var R = [], code = '', tabUU = opts.tabUU || '';
    (sel || []).forEach(function (f) {
      var raw = values ? values[f.columnName] : undefined; if (raw === undefined) return;
      var v = raw && typeof raw === 'object' ? raw.v : raw, vTo = raw && typeof raw === 'object' ? raw.vTo : null, ge = raw && typeof raw === 'object' && raw.ge;
      var type = valueType(f), colSQL = f.columnSQL || f.columnName, empty = function (x) { return x == null || String(x).length === 0; };
      if (!empty(v)) {
        if (!empty(vTo)) {                                                   // range :2978-2992
          R.push({ col: colSQL, op: OP.BETWEEN, v: v, v2: vTo, type: type, andOrSQL: 'AND', isVirtual: !!f.columnSQL });
          code = appendCode(code, f.columnName, OP.BETWEEN, codeValue(v, type), codeValue(vTo, type), 'AND', '', '', tabUU);
          return;
        }
        if (f.isEncrypted) {                                                 // :3007-3016
          var eop = v === 'Y' ? OP.NOT_NULL : OP.NULL;
          R.push({ col: colSQL, op: eop, type: type, andOrSQL: 'AND', isVirtual: !!f.columnSQL });
          code = appendCode(code, f.columnName, eop, '', '', 'AND', '', '', tabUU); return;
        }
        if ([200161, 200162, 200163].indexOf(Number(f.displayType)) >= 0) return;   // ChosenMultipleSelection: DB.intersectFilterForCSV - named gap (no code written, as legacy :3018-3023)
        var col = colSQL, val = v;
        if (isSearchLike(f)) { val = String(v).toUpperCase(); if (!/%$/.test(val)) val += '%'; col = 'UPPER(' + col + ')'; }   // :3027-3036
        if (String(val).indexOf('%') !== -1) {
          R.push({ col: col, op: OP.ILIKE, v: val, type: 'string', andOrSQL: 'AND', isVirtual: !!f.columnSQL });
          code = appendCode(code, f.columnName, OP.ILIKE, String(val), '', 'AND', '', '', tabUU);
        } else {
          var oper = ge ? OP.GREATER_EQUAL : OP.EQUAL;
          R.push({ col: col, op: oper, v: val, type: type, andOrSQL: 'AND', isVirtual: !!f.columnSQL });
          code = appendCode(code, f.columnName, oper, codeValue(val, type), '', 'AND', '', '', tabUU);
        }
      } else if (!empty(vTo)) {                                              // only the upper bound :3057-3069
        R.push({ col: colSQL, op: OP.LESS_EQUAL, v: vTo, type: type, andOrSQL: 'AND', isVirtual: !!f.columnSQL });
        code = appendCode(code, f.columnName, OP.LESS_EQUAL, codeValue(vTo, type), '', 'AND', '', '', tabUU);
      }
    });
    var out = { restrictions: R, code: code };
    if (opts.table) {
      out.where = whereOf(opts.table, R, opts);
      var h = historyClause(opts.table, opts.history, opts.dialect || 'sqlite'); if (h) out.where = '(' + out.where.slice(1, -1) + (R.length ? ' AND ' : '') + h + ')';
    }
    return out;
  }

  // ── AD_UserQuery.Code <-> advanced rows (parseUserQuery :2360-2395; history segment "<#>Week").
  function parseCode(code) {
    code = String(code || '');
    if (code.indexOf('@SQL=') === 0) return { sql: code.substring(code.indexOf('=') + 1), rows: [], history: '' };   // MColumn.VIRTUAL_UI_COLUMN_PREFIX: raw SQL
    var hist = code.split(HISTORY_SEP), history = hist.length > 1 ? hist[1] : '';
    var rows = [];
    code.split(SEGMENT_SEP).forEach(function (seg) {
      if (seg.indexOf(HISTORY_SEP) === 0) return;
      var f = seg.split(FIELD_SEP);
      rows.push({ column: f[0], op: f[1] == null ? '' : f[1], v: f[2] == null ? '' : f[2], v2: f[3] == null ? '' : f[3], andOr: f[4] == null ? '' : f[4],
        lB: f[5] == null ? '' : f[5], rB: f[6] == null ? '' : f[6], tabUU: f[7] == null ? '' : f[7], nFields: f.length });   // pre-tab-UU codes carry 7 fields
    });
    return { rows: rows, history: history };
  }
  function codeOf(rows, history) {
    var c = '';
    (rows || []).forEach(function (r) {
      var seg = appendCode('', r.column, r.op, r.v == null ? '' : r.v, r.v2 == null ? '' : r.v2, r.andOr || '', r.lB || '', r.rB || '', r.tabUU || '');
      if (r.nFields && r.nFields < 8) seg = seg.split(FIELD_SEP).slice(0, r.nFields).join(FIELD_SEP);   // keep a legacy row's own shape
      c = c ? c + SEGMENT_SEP + seg : seg;
    });
    if (history) c += SEGMENT_SEP + HISTORY_SEP + history;
    return c;
  }
  // ── cmd_saveAdvanced :2507-2840 (rows of THIS tab; child-tab EXISTS rows + M_Attribute rows = named gap -> skipped, counted).
  //    rows = parseCode rows; fieldOf(columnName) -> the field (null = not a field of the tab -> skipped, as getTargetMField null :2575).
  function advancedQuery(table, rows, fieldOf, opts) {
    opts = opts || {};
    var R = [], open = 0, skipped = [];
    (rows || []).forEach(function (row, idx) {
      if (row.tabUU && opts.tabUU && row.tabUU !== opts.tabUU) { skipped.push(row.column + ':child-tab'); return; }
      var f = fieldOf(row.column); if (!f || f.isVirtualUI) { skipped.push(row.column + ':no-field'); return; }
      var colSQL = f.columnSQL || f.columnName, lB = row.lB || '', rB = row.rB || '', andOr = row.andOr || 'AND';
      open += lB.length; open -= rB.length;                                  // :2620-2636 — depth after both brackets
      var and = idx === 0 ? true : !('OR'.indexOf(andOr) !== -1), not = andOr.indexOf('NOT') !== -1;   // :2639-2646 — "OR".contains(andOr): "OR NOT" counts as AND
      if (!andOr) and = true;
      var op = row.op, type = valueType(f), v = row.v === '' ? null : row.v;
      if (v == null) {
        if (op === OP.NULL || op === OP.NOT_NULL) R.push({ col: colSQL, op: op, type: type, andOrSQL: andOr, depth: open, isVirtual: !!f.columnSQL });   // :2683 andOr STRING
        return;
      }
      var col = op === OP.ILIKE ? 'UPPER(' + colSQL + ')' : colSQL;
      if (op === OP.BETWEEN) {
        var v2 = row.v2 === '' ? null : row.v2; if (v2 == null) return;
        R.push({ col: col, op: OP.BETWEEN, v: v, v2: v2, type: type, andOrSQL: andOr, depth: open, isVirtual: !!f.columnSQL });   // addRangeRestriction(.., andOr, depth)
        return;
      }
      R.push({ col: col, op: op, v: v, type: op === OP.ILIKE ? 'string' : type, andOrSQL: and ? 'AND' : 'OR', not: not, depth: open, isVirtual: !!f.columnSQL });
    });
    var where = whereOf(table, R, opts), h = historyClause(table, opts.history, opts.dialect || 'sqlite');
    if (h) where = '(' + where.slice(1, -1) + (R.length ? ' AND ' : '') + h + ')';
    return { restrictions: R, where: where, skipped: skipped };
  }

  // ── MUserQuery.get(ctx, AD_Tab_ID) (MUserQuery.java:50-70): user-only (client, AD_User_ID IN (0,#user)) + all-users (client 0, no user,
  //    no role) + client (#client, no user, no role) + role (client IN (0,#client), no user, role = #role or one it includes), each active,
  //    concatenated then sorted by Name (String.compareTo = UTF-16 order; a row matching two getters is listed twice, as legacy does).
  //    ctx = { clientId, userId, roleId, includedRoles: [ids] }. userCanSave :337-344 / userCanShare (client-preference roles) beside.
  function userQueryList(rows, tabId, ctx) {
    var act = (rows || []).filter(function (r) { return String(r.ad_tab_id) === String(tabId) && String(r.isactive || 'Y').toUpperCase() === 'Y'; });
    var nil = function (v) { return v == null || v === ''; }, eq = function (a, b) { return String(a) === String(b); };
    var inc = (ctx.includedRoles || []).map(String), out = [];
    act.filter(function (r) { return eq(r.ad_client_id, ctx.clientId) && !nil(r.ad_user_id) && (Number(r.ad_user_id) === 0 || eq(r.ad_user_id, ctx.userId)); }).forEach(function (r) { out.push(r); });
    act.filter(function (r) { return Number(r.ad_client_id) === 0 && nil(r.ad_user_id) && nil(r.ad_role_id); }).forEach(function (r) { out.push(r); });
    act.filter(function (r) { return eq(r.ad_client_id, ctx.clientId) && nil(r.ad_user_id) && nil(r.ad_role_id); }).forEach(function (r) { out.push(r); });
    act.filter(function (r) { return (Number(r.ad_client_id) === 0 || eq(r.ad_client_id, ctx.clientId)) && nil(r.ad_user_id) && !nil(r.ad_role_id) && (eq(r.ad_role_id, ctx.roleId) || inc.indexOf(String(r.ad_role_id)) >= 0); }).forEach(function (r) { out.push(r); });
    return out.map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) { var x = String(a.r.name), y = String(b.r.name); return x < y ? -1 : x > y ? 1 : a.i - b.i; }).map(function (x) { return x.r; });
  }
  function userCanSave(r, ctx) {   // MUserQuery.userCanSave :337-344
    if (!eqS(r.ad_client_id, ctx.clientId) || !eqS(r.ad_user_id, ctx.userId) || r.ad_user_id == null || r.ad_user_id === '') return false;
    return String(r.code || '').indexOf('@SQL=') !== 0;
  }
  function eqS(a, b) { return String(a) === String(b); }

  // FindWindow.addOperators :3148-3195 — the operator list a column offers (encrypted / lookup / number+ID / date / text)
  var LOOKUP = [17, 18, 19, 30, 200233, 200234, 200235, 200161, 200162, 200163, 20, 28, 25, 33, 53370, 32, 21, 31, 35];
  function operatorsFor(f) {
    var dt = Number(f.displayType);
    if (f.isEncrypted) return [OP.NULL, OP.NOT_NULL];
    if (LOOKUP.indexOf(dt) >= 0) return [OP.EQUAL, OP.NOT_EQUAL, OP.NULL, OP.NOT_NULL];
    if (isNumeric(dt) || isID(dt) || isDate(dt)) return [OP.EQUAL, OP.NOT_EQUAL, OP.GREATER, OP.GREATER_EQUAL, OP.LESS, OP.LESS_EQUAL, OP.BETWEEN, OP.NULL, OP.NOT_NULL];
    return OPERATORS.slice();
  }
  var OP_MSG = {}; OP_MSG[OP.EQUAL] = 'OPERATOR_EQUAL'; OP_MSG[OP.NOT_EQUAL] = 'OPERATOR_NOT_EQUAL'; OP_MSG[OP.ILIKE] = 'OPERATOR_ILIKE'; OP_MSG[OP.LIKE] = 'OPERATOR_LIKE';
  OP_MSG[OP.NOT_LIKE] = 'OPERATOR_NOT_LIKE'; OP_MSG[OP.GREATER] = 'OPERATOR_GREATER'; OP_MSG[OP.GREATER_EQUAL] = 'OPERATOR_GREATER_EQUAL'; OP_MSG[OP.LESS] = 'OPERATOR_LESS';
  OP_MSG[OP.LESS_EQUAL] = 'OPERATOR_LESS_EQUAL'; OP_MSG[OP.BETWEEN] = 'OPERATOR_BETWEEN'; OP_MSG[OP.NULL] = 'OPERATOR_NULL'; OP_MSG[OP.NOT_NULL] = 'OPERATOR_NOT_NULL';

  var API = { OP: OP, OPERATORS: OPERATORS, HISTORY_DAYS: HISTORY_DAYS, findFields: findFields, valueType: valueType, isSearchLike: isSearchLike,
    simpleQuery: simpleQuery, advancedQuery: advancedQuery, whereOf: whereOf, parseCode: parseCode, codeOf: codeOf, literal: literal, likeToGlob: likeToGlob, collate: collate, userQueryList: userQueryList, userCanSave: userCanSave, operatorsFor: operatorsFor, OP_MSG: OP_MSG };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.AdFind = API;
  else if (global) global.AdFind = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
