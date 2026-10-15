// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ad_gridtab.js — the GridTab layer: ONE tab model per AD_Tab, built only from AD metadata, owning the tab's
//   query contract (link column, link value, WhereClause, access, OrderBy) and the insert gate. Every window is
//   handled by the same object — no per-window / per-table code. Browser (window.AdGridTab) + node (module.exports).
//
// Implementing bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §GT.2 — Witness: W-GRIDTAB-CONTRACT, W-GRIDTAB-LIVE.
// EXTRACT, DON'T INVENT — each function names the iDempiere source it ports (M = org.adempiere.base/src/org/compiere/model):
//   linkColumn  ← M/GridWindow.java:193-242 (initTab) + M/GridTab.java:1317-1339 (setLinkColumnName)
//   query       ← M/GridTab.java:671-734 (query: WhereClause AND detail link, 2=3 when no link / empty value)
//                 + M/GridTable.java:415-440 (@ctx@ → Env.parseContextForSql; unresolved → 1 = 2)
//   orderBy     ← M/GridTab.java:1760-1789 (Env.parseContext on OrderByClause)
//   canInsert   ← M/GridTab.java:1517-1560 (isReadOnly incl. m_parentNeedSave, isInsertRecord) + dataNew :1151-1165
//   admit       ← the GridTable SELECT is the ONLY row source in iDempiere: a row the op-log adds must pass the SAME where.
// Determinism: read-only SQL over the given db, no Date/random.
(function (global) {
  'use strict';

  function _rows(db, sql, params) {
    var r = params ? db.exec(sql, params) : db.exec(sql);
    if (!r.length) return [];
    var cols = r[0].columns;
    return r[0].values.map(function (v) { var o = {}; for (var i = 0; i < cols.length; i++) o[cols[i]] = v[i]; return o; });
  }
  var _colCache = {};
  function tableColumns(db, table) {
    var k = String(table).toLowerCase();
    if (_colCache[k] && _colCache[k].db === db) return _colCache[k].cols;
    var cols = [];
    try { cols = _rows(db, 'PRAGMA table_info(' + String(table).replace(/[^A-Za-z0-9_]/g, '') + ')').map(function (r) { return r.name; }); } catch (e) { cols = []; }
    _colCache[k] = { db: db, cols: cols };
    return cols;
  }
  function _get(rec, col) {
    if (!rec || col == null) return undefined;
    if (Object.prototype.hasOwnProperty.call(rec, col)) return rec[col];
    var lc = String(col).toLowerCase();
    for (var k in rec) if (Object.prototype.hasOwnProperty.call(rec, k) && String(k).toLowerCase() === lc) return rec[k];
    return undefined;
  }
  function _empty(v) { return v == null || String(v) === ''; }

  // ── the tab model ──────────────────────────────────────────────────────────────────────────────────────────
  // open(db, tabs, index) — tabs = the window's active tabs in SeqNo order (ad_parser getTabs shape: id, tabLevel,
  //   tableName, whereClause, orderByClause, isReadOnly, isSingleRow, fields[{columnName,isKey}]).
  function open(db, tabs, index) {
    var tab = tabs[index]; if (!tab) return null;
    var level = Number(tab.tabLevel || 0);
    // GridTab.getParentTabNo (M/GridTab.java:3473-3503): walk back to the nearest tab with TabLevel-1.
    var parentIndex = -1;
    if (level > 0) for (var i = index - 1; i >= 0; i--) if (Number(tabs[i].tabLevel || 0) === level - 1) { parentIndex = i; break; }
    var meta = {};
    try {
      meta = _rows(db, 'SELECT t.AD_Column_ID AS lc, t.Parent_Column_ID AS pc, t.IsInsertRecord AS ins, ' +
        '(SELECT ColumnName FROM AD_Column WHERE AD_Column_ID=t.AD_Column_ID) AS lcName, ' +
        '(SELECT ColumnName FROM AD_Column WHERE AD_Column_ID=t.Parent_Column_ID) AS pcName, ' +
        '(SELECT IsDeleteable FROM AD_Table WHERE AD_Table_ID=t.AD_Table_ID) AS del ' +
        'FROM AD_Tab t WHERE t.AD_Tab_ID=?', [tab.id])[0] || {};
    } catch (e) { meta = {}; }
    var tm = {
      id: tab.id, name: tab.name, index: index, tabLevel: level, parentIndex: parentIndex,
      tableName: tab.tableName, keyColumn: keyColumn(tab),
      parents: parentColumns(db, tab.tableName),
      whereClause: tab.whereClause || '', orderByClause: tab.orderByClause || '',
      isReadOnly: !!tab.isReadOnly, isSingleRow: !!tab.isSingleRow,
      isInsertRecord: meta.ins == null ? true : String(meta.ins) !== 'N',     // GridTabVO default IsInsertRecord=true (:123-139)
      parentColumn: meta.pcName || '',                                        // AD_Tab.Parent_Column_ID (GridTab.java:1320)
      isDeleteable: meta.del == null ? true : String(meta.del) !== 'N',       // AD_Table.IsDeleteable (GridTab.isDeleteRecord)
      linkColumn: '', linkSource: 'none'
    };
    // isDetail (M/GridTab.java:1439-1448): TabLevel>0 AND (has IsParent columns OR AD_Column_ID set).
    tm.isDetail = level > 0 && (tm.parents.length > 0 || !_empty(meta.lcName));
    if (level > 0) {
      var parentTab = parentIndex >= 0 ? tabs[parentIndex] : null;
      var r = linkColumn(tm.parents, parentTab ? keyColumn(parentTab) : '', parentTab ? parentColumns(db, parentTab.tableName) : [], meta.lcName);
      tm.linkColumn = r.col; tm.linkSource = r.source;
    }
    return tm;
  }
  // GridWindow.initTab:193-242 then setLinkColumnName(null) — AD_Column_ID wins when set.
  function linkColumn(parents, parentKey, parentParents, adColumnName) {
    var col = '', source = 'none';
    if (parents.length === 1) { col = parents[0]; source = 'IsParent-single'; }
    else if (parents.length > 1) {
      for (var j = 0; j < parents.length && !col; j++) {
        if (_eq(parents[j], parentKey)) { col = parents[j]; source = 'IsParent-parentKey'; break; }
        if (!parentKey) for (var k = 0; k < parentParents.length; k++) if (_eq(parents[j], parentParents[k])) { col = parents[j]; source = 'IsParent-parentParents'; break; }
      }
    }
    if (!_empty(adColumnName)) { col = adColumnName; source = 'AD_Column_ID'; }
    return { col: col, source: source };
  }
  function _eq(a, b) { return a != null && b != null && String(a).toLowerCase() === String(b).toLowerCase(); }
  function keyColumn(tab) {
    var k = (tab.fields || []).filter(function (f) { return f.isKey; })[0];
    return k ? k.columnName : (tab.tableName ? tab.tableName + '_ID' : null);
  }
  function parentColumns(db, tableName) {
    if (!tableName) return [];
    try {
      return _rows(db, "SELECT c.ColumnName AS n FROM AD_Column c JOIN AD_Table t ON t.AD_Table_ID=c.AD_Table_ID " +
        "WHERE lower(t.TableName)=lower(?) AND c.IsParent='Y' AND COALESCE(c.IsActive,'Y')='Y' ORDER BY c.AD_Column_ID", [tableName]).map(function (r) { return r.n; });
    } catch (e) { return []; }
  }

  // Env.parseContext (raw text substitution, as iDempiere — the clause author writes the quotes). @Name@ / @#Name@ /
  //   @$Name@ / @Name:default@. ANY unresolved token → { sql:'' } (parseContext returns "" when !ignoreUnparsable).
  function parseContext(clause, ctxGet) {
    var unresolved = [];
    var sql = String(clause || '').replace(/@([#$]?[A-Za-z0-9_]+)(?::([^@]*))?@/g, function (whole, name, dflt) {
      var v = ctxGet ? ctxGet(name) : null;
      if (_empty(v) && dflt != null) v = dflt;
      if (_empty(v)) { unresolved.push(name); return whole; }
      return String(v).replace(/'/g, "''");
    });
    return unresolved.length ? { sql: '', unresolved: unresolved } : { sql: sql, unresolved: [] };
  }

  // query(tm, ctxGet, accessClauses) — the tab's WHERE exactly as GridTab.query + GridTable.createSelectSql build it.
  //   ctxGet(name) = window context: the parent tab's current row first, then the window, then #globals.
  function query(tm, ctxGet, accessClauses) {
    var parts = [], note = [], q = { linkValue: null, parentNeedSave: false, unresolved: [] }, nTab = 0;
    if (tm.whereClause) {
      if (tm.whereClause.indexOf('@') < 0) parts.push('(' + tm.whereClause + ')');
      else {
        var p = parseContext(tm.whereClause, ctxGet);
        if (p.sql.trim()) parts.push('(' + p.sql + ')');
        else { parts.push('(1 = 2)'); q.unresolved = p.unresolved; note.push('where-unresolved=' + p.unresolved.join(',')); }
      }
      nTab = 1;
    }
    if (tm.isDetail) {
      var lc = tm.linkColumn;
      if (!lc) { parts.push('2=3'); note.push('no-link-column'); }
      else {
        var eff = tm.parentColumn || lc;
        var v = ctxGet ? ctxGet(eff) : null;
        q.linkValue = _empty(v) ? null : v;
        if (_empty(v)) { parts.push('2=3'); q.parentNeedSave = true; note.push('parent-not-saved'); }
        else parts.push(tm.tableName + '.' + lc + '=' + (/_ID$/i.test(lc) && /^-?\d+$/.test(String(v)) ? String(Number(v)) : "'" + String(v).replace(/'/g, "''") + "'"));
      }
    }
    (accessClauses || []).forEach(function (c) { if (c) parts.push(c); });
    q.where = parts.length ? parts.join(' AND ') : null;
    // GridTable.dataRefreshAll(rowToRetained) ORs the retained row into the requery (M/GridTable.java:2474-2490): the record just
    // saved stays in the tab even when it fails the tab WhereClause — but never outside its parent link / access scope.
    q.whereRetain = parts.slice(nTab).length ? parts.slice(nTab).join(' AND ') : null;
    var ob = tm.orderByClause;
    if (ob && ob.indexOf('@') >= 0) { var po = parseContext(ob, ctxGet); ob = po.sql || null; }
    q.orderBy = ob || null;
    q.note = note.join(' ');
    return q;
  }
  // canInsert — GridTab.isInsertRecord (isReadOnly incl. m_parentNeedSave → false) + dataNew's detail guard.
  function canInsert(tm, q) { return !!tm && !tm.isReadOnly && tm.isInsertRecord && !(q && q.parentNeedSave); }

  // admit(db, tableName, rows, where) — keep only the rows for which `where` is TRUE, evaluated by sqlite itself over a
  //   one-row derived table aliased as the tab table (every table column bound; numeric strings bound as numbers).
  function admit(db, tableName, rows, where) {
    if (!where || !rows || !rows.length) return { rows: rows || [], rejected: [] };
    var cols = tableColumns(db, tableName);
    if (!cols.length) return { rows: rows, rejected: [], error: 'no-columns' };
    var alias = String(tableName).replace(/[^A-Za-z0-9_]/g, '');
    var sel = 'SELECT 1 FROM (SELECT ' + cols.map(function (c) { return '? AS "' + c + '"'; }).join(', ') + ') AS ' + alias + ' WHERE ' + where;
    var kept = [], rejected = [];
    rows.forEach(function (r) {
      var params = cols.map(function (c) {
        var v = _get(r, c);
        if (v === undefined || v === null) return null;
        if (typeof v === 'number') return v;
        if (typeof v === 'boolean') return v ? 'Y' : 'N';
        return /^-?\d+(\.\d+)?$/.test(String(v)) ? Number(v) : String(v);
      });
      var ok = false;
      try { ok = db.exec(sel, params).length > 0; } catch (e) { ok = false; }
      (ok ? kept : rejected).push(r);
    });
    return { rows: kept, rejected: rejected };
  }
  // dataRefreshAll keep-by-key (M/GridTab.java:908-940).
  function indexOfKey(rows, keyCol, key) {
    if (key == null || !rows) return -1;
    for (var i = 0; i < rows.length; i++) if (String(_get(rows[i], keyCol)) === String(key)) return i;
    return -1;
  }

  // ── §UDP-4 the initial query of a window (bim-compiler prompts/ERP_DEPTH_FILM.md §UDP-4; Witness: W-UDP4-ENGINE / W-UDP4-LIVE).
  //   AbstractADWindowContent :416-422 (a transaction window - AD_Window.WindowType 'T' - queries only current rows), initialQuery
  //   :899-991 (Find first when the tab is high volume, or - not a transaction window - when isQueryRequire(row count)),
  //   GridTable :437-446 (the only-current clause, header tab only), GridTab.getMaxQueryRecords :3677-3687, isQueryRequire :3694-3703,
  //   MRole.getConfirmQueryRecords :414-420 (0 -> 500), GridTab.DEFAULT_GLOBAL_MAX_QUERY_RECORDS = 100000 (:245).
  function onlyCurrentClause(dialect) { return "(Processed='N' OR Updated>" + (dialect === 'pg' ? 'getDate()-1' : "datetime('now','localtime','-1 day')") + ')'; }
  function maxQueryRecords(tabMax, roleMax, globalMax) {
    var t = Number(tabMax) || 0, r = Number(roleMax) || 0;
    if (r > 0 && (r < t || t === 0)) t = r;
    if (t === 0) t = globalMax != null && String(globalMax) !== '' ? Number(globalMax) : 100000;
    return t;
  }
  function isQueryRequire(n, maxQ, confirm) {
    if (n < 2) return false;
    if (maxQ > 0 && n > maxQ) return true;
    return n > ((Number(confirm) || 0) === 0 ? 500 : Number(confirm));
  }
  // o = { isTransaction, isHighVolume, tabMax, roleMax, globalMax, roleConfirm, countAll: fn -> n (or -1 on failure) }
  function initialDecision(o) {
    var require = !!o.isHighVolume, n = null;
    if (!require && !o.isTransaction) { n = o.countAll ? o.countAll() : -1; require = n === -1 ? true : isQueryRequire(n, maxQueryRecords(o.tabMax, o.roleMax, o.globalMax), o.roleConfirm); }
    return { onlyCurrentRows: !!o.isTransaction, findFirst: require, countAll: n };
  }

  var API = { onlyCurrentClause: onlyCurrentClause, maxQueryRecords: maxQueryRecords, isQueryRequire: isQueryRequire, initialDecision: initialDecision, open: open, linkColumn: linkColumn, parentColumns: parentColumns, keyColumn: keyColumn, parseContext: parseContext,
              query: query, canInsert: canInsert, admit: admit, indexOfKey: indexOfKey, tableColumns: tableColumns, value: _get };
  // ── §UDP-ORDER the row order of a tab (bim-compiler prompts/ERP_DEPTH_FILM.md §UDP-ORDER; Witness: W-UDP-ORDER).
  //   GridTab.getOrderByClause :1760-1789: the tab's OrderByClause, else the fields' SortNo slots 1..3 (|SortNo|, negative = DESC;
  //   GridTab.initTab :386-423 walks the fields in AD_Field_v order, a later field overwrites a slot), else "Created" (+ " DESC" on a
  //   header tab queried with onlyCurrentRows). fields = [{ columnName, sortNo }] in AD_Field_v order (IsDisplayed DESC, SeqNo).
  function orderByOf(tabOrderBy, fields, onlyCurrentRows, isDetail) {
    if (tabOrderBy && String(tabOrderBy).length > 0) return String(tabOrderBy);
    var slots = [null, null, null];
    (fields || []).forEach(function (f) {
      var n = Number(f.sortNo) || 0, a = Math.abs(n); if (a < 1 || a > 3) return;
      slots[a - 1] = f.columnName + (n < 0 ? ' DESC' : '');
    });
    var ob = slots.filter(function (x) { return x; }).join(',');
    if (ob) return ob;
    // Third prio "Created" + " DESC" when m_vo.onlyCurrentRows on a header tab. In a running legacy server that flag is TRUE for every
    // window opened before (GridWindowVO :154 serves a cached clone; GridTabVO.clone :754 sets onlyCurrentRows=true), so the steady state
    // is DESC on every header tab; only the very first open after a server restart lists a non-transaction window ASC. The twin follows
    // the steady state (W-UDP-ORDER: M_Shipper window 142 is DESC on the pilot although it is not a transaction window).
    return 'Created' + (!isDetail ? ' DESC' : '');
  }
  // sortRows — PostgreSQL's ORDER BY semantics over rows already read (SQLite cannot: it orders text by bytes and puts NULLs first on
  //   ASC). Terms that are plain columns ("Col", "Col DESC", "Table.Col ASC", optional NULLS FIRST/LAST) are applied; any other term
  //   (an expression) keeps the order SQLite gave (returns { applied:false }). Text = collate (the pilot DB's glibc en_US.utf8, AdFind.collate),
  //   numbers numeric; NULL is larger than any value (ASC -> last, DESC -> first). Stable.
  function rowComparator(orderBy, collate) {
    var terms = String(orderBy || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean), spec = [];
    for (var i = 0; i < terms.length; i++) {
      var m = /^(?:[A-Za-z0-9_]+\.)?([A-Za-z0-9_]+)(?:\s+(ASC|DESC))?(?:\s+NULLS\s+(FIRST|LAST))?$/i.exec(terms[i]);
      if (!m) return { cmp: null, reason: 'expression: ' + terms[i] };
      var desc = /desc/i.test(m[2] || ''), nulls = m[3] ? m[3].toUpperCase() : (desc ? 'FIRST' : 'LAST');
      spec.push({ col: m[1].toLowerCase(), desc: desc, nullsFirst: nulls === 'FIRST' });
    }
    if (!spec.length) return { cmp: null, reason: 'no order' };
    var keyOf = {};
    function val(r, c) {
      if (!keyOf[c]) { for (var k in r) if (r.hasOwnProperty(k) && k.toLowerCase() === c) { keyOf[c] = k; break; } if (!keyOf[c]) keyOf[c] = c; }
      return r[keyOf[c]];
    }
    var cmpV = function (a, b) {
      if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
      if (collate) return collate(String(a), String(b));
      a = String(a); b = String(b); return a < b ? -1 : a > b ? 1 : 0;
    };
    return { cmp: function (x, y) {
      for (var s = 0; s < spec.length; s++) {
        var t = spec[s], a = val(x, t.col), b = val(y, t.col), an = a == null, bn = b == null, c;
        if (an || bn) { if (an && bn) continue; return an ? (t.nullsFirst ? -1 : 1) : (t.nullsFirst ? 1 : -1); }
        c = cmpV(a, b); if (t.desc) c = -c; if (c) return c;
      }
      return 0;
    } };
  }
  function sortRows(rows, orderBy, collate) {
    var rc = rowComparator(orderBy, collate);
    if (!rc.cmp) return { rows: rows, applied: false, reason: rc.reason };
    if (!rows || rows.length < 2) return { rows: rows, applied: true };
    var idx = rows.map(function (r, i) { return { r: r, i: i }; });
    idx.sort(function (x, y) { return rc.cmp(x.r, y.r) || (x.i - y.i); });   // stable
    return { rows: idx.map(function (x) { return x.r; }), applied: true };
  }
  API.orderByOf = orderByOf; API.sortRows = sortRows; API.rowComparator = rowComparator;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.AdGridTab = API;
})(typeof window !== 'undefined' ? window : this);
