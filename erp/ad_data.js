// ad_data.js — Implementing ERP_AD_UI.md §6 — Witness: W-ERP-ADUI
// Generic CRUD for any AD_Table record. Read/save/delete via metadata.
// All writes log to kernel_ops for undo/redo/audit.
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
(function () {
  'use strict';

  // ── PB bridge state (docs/ERP.md §0) ────────────────────────────────
  // Default OFF: legacy real-table CRUD (the shipped AD-faithful product).
  // ADData.useBridge(map) flips every read/save/delete to route through the
  // 5-table runtime via ad_table_map. Behavior-preserving until turned on.
  var _bridge = null;       // the ad_table_map module when active
  var _genSeq = 0;          // PB stopgap id source (real keys are supplied; GUIDs are P5)

  function useBridge(map) {
    _bridge = map;
    console.log('§BRIDGE useBridge ON overrides=' +
      (map && map.OVERRIDES ? Object.keys(map.OVERRIDES).length : '?'));
  }
  function legacyMode() { _bridge = null; }

  function _keyCol(table) { return table + '_ID'; }

  // Structural routing for one legacy column → real 5-table column, or null=>metadata.
  function _routeCol(table, slot, fkMap, col) {
    var keyCol = _keyCol(table);
    if (col === keyCol) return 'id';
    if (fkMap[col]) return fkMap[col];                       // explicit (source_id, document_id, …)
    if (col === 'DocStatus' && slot === 'documents') return 'doc_status';
    return null;                                              // → metadata[col]
  }

  // Split a legacy record into {struct, meta} per the slot's column shape.
  function _split(table, t, record) {
    var struct = {}, meta = { _table: table };
    var keys = Object.keys(record);
    for (var i = 0; i < keys.length; i++) {
      var c = keys[i], v = record[c];
      var dest = _routeCol(table, t.slot, t.fk_map, c);
      if (dest === 'id') { struct.id = (v != null && v !== '') ? String(v) : null; }
      else if (dest === 'line_no') { struct.line_no = (v == null || v === '') ? null : Number(v); }
      else if (dest) { struct[dest] = (v != null && v !== '') ? String(v) : null; }
      else { meta[c] = v; }
    }
    return { struct: struct, meta: meta };
  }

  function _newId(table) { _genSeq++; return table + '#' + _genSeq; }

  // Reconstruct the legacy record from a 5-table row (inverse of _split).
  function _rebuild(table, t, row) {
    var rec = {};
    var meta = {};
    try { meta = JSON.parse(row.metadata || '{}'); } catch (e) { meta = {}; }
    delete meta._table;
    // metadata fields verbatim (keyed by ColumnName)
    Object.keys(meta).forEach(function (k) { rec[k] = meta[k]; });
    // key column from id
    var keyCol = _keyCol(table);
    rec[keyCol] = _numish(row.id);
    // structural reverse-map
    if (t.slot === 'documents' && row.doc_status != null) rec.DocStatus = row.doc_status;
    var inv = {};
    Object.keys(t.fk_map).forEach(function (col) { inv[t.fk_map[col]] = col; });
    if (t.slot === 'documents') {
      if (inv.source_id && row.source_id != null) rec[inv.source_id] = _numish(row.source_id);
      if (inv.parent_id && row.parent_id != null) rec[inv.parent_id] = _numish(row.parent_id);
      if (inv.container_id && row.container_id != null) rec[inv.container_id] = _numish(row.container_id);
    } else if (t.slot === 'document_lines') {
      if (inv.document_id && row.document_id != null) rec[inv.document_id] = _numish(row.document_id);
      if (inv.source_line_id && row.source_line_id != null) rec[inv.source_line_id] = _numish(row.source_line_id);
      if (inv.line_no && row.line_no != null) rec[inv.line_no] = row.line_no;
    } else if (t.slot === 'items' || t.slot === 'containers') {
      if (inv.parent_id && row.parent_id != null) rec[inv.parent_id] = _numish(row.parent_id);
    }
    return rec;
  }
  function _numish(v) { if (v == null) return v; var n = Number(v); return (!isNaN(n) && String(n) === String(v)) ? n : v; }

  // Read one slot table as objects keyed by real column name.
  function _rows(db, sql, params) {
    var r = db.exec(sql, params || []);
    if (!r.length) return [];
    var cols = r[0].columns;
    return r[0].values.map(function (row) {
      var o = {}; for (var i = 0; i < cols.length; i++) o[cols[i]] = row[i]; return o;
    });
  }

  // ── Bridge CRUD ──────────────────────────────────────────────────────
  function _saveBridge(db, table, record) {
    var t = _bridge.target(table);
    var s = _split(table, t, record);
    var action;
    if (!s.struct.id) { s.struct.id = _newId(table); action = 'INSERT'; }
    else {
      var exists = _rows(db, 'SELECT id FROM ' + t.slot + ' WHERE id=?', [s.struct.id]).length > 0;
      action = exists ? 'UPDATE' : 'INSERT';
    }
    var metaJson = JSON.stringify(s.meta);
    if (t.slot === 'documents') {
      _upsert(db, 'documents', s.struct.id, action,
        { doc_type: t.docType, doc_status: s.struct.doc_status || 'DR',
          source_id: s.struct.source_id || null, parent_id: s.struct.parent_id || null,
          container_id: s.struct.container_id || null, metadata: metaJson });
    } else if (t.slot === 'document_lines') {
      _upsert(db, 'document_lines', s.struct.id, action,
        { document_id: s.struct.document_id || null, source_line_id: s.struct.source_line_id || null,
          line_no: (s.struct.line_no == null ? null : s.struct.line_no),
          match_type: t.match_type || null, metadata: metaJson });
    } else if (t.slot === 'journal') {
      _upsert(db, 'journal', s.struct.id, action,
        { batch_id: s.struct.batch_id || null, journal_id: s.struct.journal_id || null,
          source: s.struct.source || null, metadata: metaJson });
    } else { // items | containers
      _upsert(db, t.slot, s.struct.id, action,
        { parent_id: s.struct.parent_id || null, type: table, metadata: metaJson });
    }
    if (typeof KernelOps !== 'undefined') {
      KernelOps.commitOp(db, 'AD_SAVE', { table: table, slot: t.slot, id: s.struct.id, action: action });
    }
    var legacyId = _numish(s.struct.id);
    record[_keyCol(table)] = legacyId;
    console.log('§BRIDGE save table=' + table + ' slot=' + t.slot + ' id=' + s.struct.id + ' action=' + action);
    return { id: legacyId, action: action };
  }

  function _upsert(db, slot, id, action, cols) {
    var names = Object.keys(cols);
    if (action === 'INSERT') {
      var all = ['id'].concat(names);
      var vals = [id].concat(names.map(function (n) { return cols[n]; }));
      db.run('INSERT INTO ' + slot + ' (' + all.join(',') + ') VALUES (' +
        all.map(function () { return '?'; }).join(',') + ')', vals);
    } else {
      var sets = names.map(function (n) { return n + '=?'; });
      var sv = names.map(function (n) { return cols[n]; }); sv.push(id);
      db.run('UPDATE ' + slot + ' SET ' + sets.join(',') + ' WHERE id=?', sv);
    }
  }

  // filter: optional {col, value} (legacy column) OR null for all rows of this table.
  function _readBridge(db, table, filter) {
    var t = _bridge.target(table);
    var where = [], params = [];
    // identity of the legacy table within its slot
    if (t.slot === 'documents') { where.push('doc_type=?'); params.push(t.docType); }
    else if (t.slot === 'items' || t.slot === 'containers') { where.push('type=?'); params.push(table); }
    else { where.push("json_extract(metadata,'$._table')=?"); params.push(table); }
    if (filter && filter.col != null) {
      var dest = _routeCol(table, t.slot, t.fk_map, filter.col);
      if (dest) { where.push(dest + '=?'); params.push(dest === 'line_no' ? Number(filter.value) : String(filter.value)); }
      else { where.push("json_extract(metadata,'$." + filter.col + "')=?"); params.push(filter.value); }
    }
    var rows = _rows(db, 'SELECT * FROM ' + t.slot + ' WHERE ' + where.join(' AND '), params);
    var out = rows.map(function (r) { return _rebuild(table, t, r); });
    console.log('§BRIDGE read table=' + table + ' slot=' + t.slot + ' count=' + out.length);
    return out;
  }

  function _deleteBridge(db, table, id) {
    var t = _bridge.target(table);
    db.run('DELETE FROM ' + t.slot + ' WHERE id=?', [String(id)]);
    if (typeof KernelOps !== 'undefined') {
      KernelOps.commitOp(db, 'AD_DELETE', { table: table, slot: t.slot, id: String(id) });
    }
    console.log('§BRIDGE delete table=' + table + ' slot=' + t.slot + ' id=' + id);
  }

  // Parse a simple "Col = value" / "Col=value" where clause into {col,value}.
  function _parseWhere(where) {
    if (!where) return null;
    var m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*'?([^']*)'?\s*$/.exec(where);
    return m ? { col: m[1], value: m[2] } : null;
  }

  /**
   * Read records from any table.
   * @param {Object} db        sql.js database
   * @param {string} tableName e.g. 'C_Project'
   * @param {string} [where]   e.g. 'C_BPartner_ID = 117'
   * @param {string} [orderBy] e.g. 'Name'
   * @returns {Array} array of { colName: value } objects
   */
  function readRecords(db, tableName, where, orderBy) {
    if (_bridge) return _readBridge(db, tableName, _parseWhere(where));
    var sql = 'SELECT * FROM ' + tableName;
    if (where) sql += ' WHERE ' + where;
    if (orderBy) sql += ' ORDER BY ' + orderBy;

    console.log('§AD_DATA readRecords table=' + tableName + ' where=' + (where || '*'));
    try {
      var r = db.exec(sql);
      if (!r.length) {
        console.log('§AD_DATA readRecords table=' + tableName + ' count=0');
        return [];
      }
      var cols = r[0].columns;
      var rows = r[0].values.map(function (row) {
        var obj = {};
        for (var i = 0; i < cols.length; i++) obj[cols[i]] = row[i];
        return obj;
      });
      console.log('§AD_DATA readRecords table=' + tableName + ' count=' + rows.length);
      return rows;
    } catch (e) {
      console.log('§AD_DATA readRecords ERROR table=' + tableName + ' err=' + e.message);
      return [];
    }
  }

  /**
   * Get the key column name for a table from AD_Column metadata.
   * Convention: TableName + '_ID' is the key column.
   * @param {string} tableName
   * @returns {string} key column name
   */
  function keyColumn(tableName) {
    return tableName + '_ID';
  }

  /**
   * Save (insert or update) a record.
   * Uses AD convention: if record[keyCol] exists and > 0, UPDATE; else INSERT.
   * @param {Object} db        sql.js database
   * @param {string} tableName e.g. 'C_Project'
   * @param {Object} record    { ColumnName: value }
   * @param {Array}  columns   AD_Column metadata array from getFields
   * @returns {{ id: number, action: string }}
   */
  function saveRecord(db, tableName, record, columns) {
    if (_bridge) return _saveBridge(db, tableName, record);
    var keyCol = keyColumn(tableName);
    var id = record[keyCol];
    var action;

    // Build column list from record keys (skip key col for INSERT values)
    var setCols = Object.keys(record).filter(function (k) { return k !== keyCol; });

    if (id && id > 0) {
      // UPDATE
      action = 'UPDATE';
      var setParts = setCols.map(function (c) { return c + ' = ?'; });
      var setVals = setCols.map(function (c) { return record[c]; });
      setVals.push(id);
      db.run('UPDATE ' + tableName + ' SET ' + setParts.join(', ') +
             ' WHERE ' + keyCol + ' = ?', setVals);
    } else {
      // INSERT — generate next ID
      action = 'INSERT';
      id = getNextId(db, tableName);
      record[keyCol] = id;
      var allCols = [keyCol].concat(setCols);
      var allVals = [id].concat(setCols.map(function (c) { return record[c]; }));
      var placeholders = allCols.map(function () { return '?'; });
      db.run('INSERT INTO ' + tableName + ' (' + allCols.join(', ') + ') VALUES (' +
             placeholders.join(', ') + ')', allVals);
    }

    // Log to kernel_ops
    if (typeof KernelOps !== 'undefined') {
      KernelOps.commitOp(db, 'AD_SAVE', { table: tableName, id: id, action: action });
    }

    console.log('§AD_DATA saveRecord table=' + tableName + ' id=' + id + ' action=' + action);
    return { id: id, action: action };
  }

  /**
   * Delete a record by key.
   * @param {Object} db        sql.js database
   * @param {string} tableName
   * @param {string} keyCol    key column name
   * @param {*}      keyValue  key value
   */
  function deleteRecord(db, tableName, keyCol, keyValue) {
    if (_bridge) return _deleteBridge(db, tableName, keyValue);
    console.log('§AD_DATA deleteRecord table=' + tableName + ' key=' + keyCol + '=' + keyValue);
    db.run('DELETE FROM ' + tableName + ' WHERE ' + keyCol + ' = ?', [keyValue]);

    if (typeof KernelOps !== 'undefined') {
      KernelOps.commitOp(db, 'AD_DELETE', { table: tableName, key: keyCol, value: keyValue });
    }
  }

  /**
   * Simple next ID: MAX(keyCol) + 1.
   * @param {Object} db
   * @param {string} tableName
   * @returns {number}
   */
  function getNextId(db, tableName) {
    var keyCol = tableName + '_ID';
    try {
      var r = db.exec('SELECT MAX(' + keyCol + ') FROM ' + tableName);
      var maxVal = (r.length && r[0].values.length) ? Number(r[0].values[0][0]) : 0;
      return (maxVal || 0) + 1;
    } catch (e) {
      console.log('§AD_DATA getNextId fallback table=' + tableName);
      return 1000000; // safe fallback for new tables
    }
  }

  /**
   * Get record count for a table.
   */
  function countRecords(db, tableName, where) {
    var sql = 'SELECT COUNT(*) FROM ' + tableName;
    if (where) sql += ' WHERE ' + where;
    try {
      var r = db.exec(sql);
      return (r.length && r[0].values.length) ? Number(r[0].values[0][0]) : 0;
    } catch (e) {
      return 0;
    }
  }

  // ── §14. FK resolution — show Name not integer ─────────────────────

  var _fkCache = {};  // { 'C_BPartner:117': 'Seed Farm', ... }

  /**
   * Resolve an FK integer to its display name.
   * Convention: columnName 'C_BPartner_ID' → table 'C_BPartner', key 'C_BPartner_ID'.
   * Looks for Name or identifier column in the target table.
   * @param {Object} db
   * @param {string} columnName  e.g. 'C_BPartner_ID'
   * @param {*}      value       the FK integer
   * @returns {string|null} resolved display name or null
   */
  function resolveFK(db, columnName, value) {
    if (value === null || value === undefined || value === '') return null;
    var intVal = Number(value);
    if (isNaN(intVal) || intVal <= 0) return null;

    // Derive table name: strip trailing _ID
    if (columnName.indexOf('_ID') < 0) return null;
    var tableName = columnName.replace(/_ID$/, '');

    var cacheKey = tableName + ':' + intVal;
    if (_fkCache[cacheKey] !== undefined) return _fkCache[cacheKey];

    // Try Name column first, then Value, then first text column
    var candidates = ['Name', 'Value', 'DocumentNo'];
    for (var i = 0; i < candidates.length; i++) {
      try {
        var r = db.exec('SELECT ' + candidates[i] + ' FROM [' + tableName +
                        '] WHERE ' + columnName + ' = ' + intVal + ' LIMIT 1');
        if (r.length && r[0].values.length && r[0].values[0][0]) {
          var name = String(r[0].values[0][0]);
          _fkCache[cacheKey] = name;
          console.log('§AD_DATA resolveFK col=' + columnName + ' id=' + intVal + ' name=' + name);
          return name;
        }
      } catch (e) { /* column doesn't exist, try next */ }
    }

    _fkCache[cacheKey] = null;
    return null;
  }

  /**
   * Clear FK cache (for testing / client switch).
   */
  function clearFKCache() {
    _fkCache = {};
  }

  /**
   * Get all tables with row counts (for heatmap).
   * @param {Object} db
   * @returns {Array} [{tableName, count, type}] sorted by count desc
   */
  function getTableStats(db) {
    var stats = [];
    try {
      var r = db.exec('SELECT TableName FROM AD_Table WHERE IsActive = \'Y\' ORDER BY TableName');
      if (!r.length) return stats;
      for (var i = 0; i < r[0].values.length; i++) {
        var tbl = r[0].values[i][0];
        try {
          var cnt = db.exec('SELECT COUNT(*) FROM [' + tbl + ']');
          var count = (cnt.length && cnt[0].values.length) ? Number(cnt[0].values[0][0]) : 0;
          if (count > 0) {
            var type = tbl.indexOf('AD_') === 0 ? 'system'
                     : tbl.indexOf('C_') === 0 ? 'commercial'
                     : tbl.indexOf('M_') === 0 ? 'material'
                     : 'other';
            stats.push({ tableName: tbl, count: count, type: type });
          }
        } catch (e) { /* table doesn't exist in DB */ }
      }
    } catch (e) {
      console.log('§AD_DATA getTableStats error: ' + e.message);
    }
    stats.sort(function (a, b) { return b.count - a.count; });
    console.log('§AD_DATA getTableStats tables=' + stats.length);
    return stats;
  }

  /**
   * Get field completeness for current records (for window heatmap).
   * @param {Array} records  array of record objects
   * @param {Array} fields   AD_Field metadata array
   * @returns {Array} [{fieldName, filled, total, pct}]
   */
  function getFieldCompleteness(records, fields) {
    if (!records.length || !fields.length) return [];
    var result = [];
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f.isKey || !f.isDisplayed) continue;
      var filled = 0;
      for (var j = 0; j < records.length; j++) {
        var val = records[j][f.columnName];
        if (val !== null && val !== undefined && val !== '') filled++;
      }
      result.push({
        fieldName: f.name,
        columnName: f.columnName,
        filled: filled,
        total: records.length,
        pct: Math.round((filled / records.length) * 100)
      });
    }
    result.sort(function (a, b) { return a.pct - b.pct; });
    console.log('§AD_DATA fieldCompleteness fields=' + result.length + ' records=' + records.length);
    return result;
  }

  // ── Public API ─────────────────────────────────────────────────────

  var ADData = {
    readRecords:        readRecords,
    saveRecord:         saveRecord,
    deleteRecord:       deleteRecord,
    useBridge:          useBridge,
    legacyMode:         legacyMode,
    getNextId:          getNextId,
    countRecords:       countRecords,
    keyColumn:          keyColumn,
    resolveFK:          resolveFK,
    clearFKCache:       clearFKCache,
    getTableStats:      getTableStats,
    getFieldCompleteness: getFieldCompleteness
  };

  if (typeof window !== 'undefined') window.ADData = ADData;
  if (typeof module !== 'undefined' && module.exports) module.exports = ADData;

  console.log('§AD_DATA_LOADED v1');
})();
