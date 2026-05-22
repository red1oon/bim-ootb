// ad_data.js — Implementing ERP_AD_UI.md §6 — Witness: W-ERP-ADUI
// Generic CRUD for any AD_Table record. Read/save/delete via metadata.
// All writes log to kernel_ops for undo/redo/audit.
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
(function () {
  'use strict';

  /**
   * Read records from any table.
   * @param {Object} db        sql.js database
   * @param {string} tableName e.g. 'C_Project'
   * @param {string} [where]   e.g. 'C_BPartner_ID = 117'
   * @param {string} [orderBy] e.g. 'Name'
   * @returns {Array} array of { colName: value } objects
   */
  function readRecords(db, tableName, where, orderBy) {
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
