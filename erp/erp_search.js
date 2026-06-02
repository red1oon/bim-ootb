// erp_search.js — Implementing ERP_Roadmap.md §R1 — Witness: W-ERP-SEARCH
// FTS5 full-text search across all AD data tables.
// Pattern detection, BM25 ranking, debounced typeahead.
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
(function () {
  'use strict';

  var _db = null;
  var _indexed = false;

  // ── Tables to index (with display columns) ─────────────────────────

  var SEARCHABLE = [
    // GardenWorld (C_/M_ tables)
    { table: 'C_BPartner',    cols: ['Name','Value','Description'],  display: 'Name',   windowId: 123, client: 'gardenworld' },
    { table: 'M_Product',     cols: ['Name','Value','Description'],  display: 'Name',   windowId: 140, client: 'gardenworld' },
    { table: 'C_Order',       cols: ['DocumentNo','Description'],    display: 'DocumentNo', windowId: 143, client: 'gardenworld' },
    { table: 'C_Invoice',     cols: ['DocumentNo','Description'],    display: 'DocumentNo', windowId: 167, client: 'gardenworld' },
    { table: 'C_Payment',     cols: ['DocumentNo','Description'],    display: 'DocumentNo', windowId: 195, client: 'gardenworld' },
    { table: 'M_InOut',       cols: ['DocumentNo','Description'],    display: 'DocumentNo', windowId: 169, client: 'gardenworld' },
    { table: 'C_Project',     cols: ['Name','Value','Description'],  display: 'Name',   windowId: 130, client: 'gardenworld' },
    { table: 'C_ElementValue',cols: ['Name','Value','Description'],  display: 'Name',   windowId: 158, client: 'gardenworld' },
    { table: 'M_Product_Category', cols: ['Name','Description'],     display: 'Name',   windowId: 401, client: 'gardenworld' },
    { table: 'M_Warehouse',   cols: ['Name','Value','Description'],  display: 'Name',   windowId: 139, client: 'gardenworld' },
    { table: 'C_BPartner_Location', cols: ['Name','Phone'],          display: 'Name',   windowId: 123, client: 'gardenworld' },
    { table: 'AD_User',       cols: ['Name','EMail','Description'],  display: 'Name',   windowId: 123, client: 'gardenworld' },
    { table: 'C_DocType',     cols: ['Name','PrintName','Description'], display: 'Name', windowId: null, client: 'gardenworld' },
    { table: 'C_Country',     cols: ['Name','CountryCode','Description'], display: 'Name', windowId: null, client: 'gardenworld' },
    { table: 'C_Tax',         cols: ['Name','Description'],          display: 'Name',   windowId: null, client: 'gardenworld' },
    { table: 'C_Charge',      cols: ['Name','Description'],          display: 'Name',   windowId: null, client: 'gardenworld' },
    { table: 'C_BP_Group',    cols: ['Name','Value','Description'],  display: 'Name',   windowId: null, client: 'gardenworld' },
    // System (AD_ tables)
    { table: 'AD_Window',     cols: ['Name','Description'],          display: 'Name',   windowId: 102, client: 'system' },
    { table: 'AD_Table',      cols: ['TableName','Name','Description'], display: 'Name', windowId: 100, client: 'system' },
    { table: 'AD_Menu',       cols: ['Name','Description'],          display: 'Name',   windowId: 105, client: 'system' },
    { table: 'AD_Tab',        cols: ['Name','Description'],          display: 'Name',   windowId: null, client: 'system' },
    { table: 'AD_Reference',  cols: ['Name','Description'],          display: 'Name',   windowId: null, client: 'system' },
    { table: 'AD_Element',    cols: ['ColumnName','Name','Description'], display: 'Name', windowId: null, client: 'system' }
  ];

  // ── Document number patterns ───────────────────────────────────────

  var DOC_PATTERNS = [
    { regex: /^INV[-#]?\d/i,  table: 'C_Invoice',  label: 'Invoice' },
    { regex: /^PO[-#]?\d/i,   table: 'C_Order',    label: 'Purchase Order', filter: "IsSOTrx = 'N'" },
    { regex: /^SO[-#]?\d/i,   table: 'C_Order',    label: 'Sales Order',    filter: "IsSOTrx = 'Y'" },
    { regex: /^PAY[-#]?\d/i,  table: 'C_Payment',  label: 'Payment' },
    { regex: /^MM[-#]?\d/i,   table: 'M_InOut',    label: 'Shipment' },
    { regex: /^MR[-#]?\d/i,   table: 'M_InOut',    label: 'Material Receipt' }
  ];

  // ── Build FTS5 index ──────────────────────────────────────────────

  function buildIndex(db) {
    _db = db;
    var t0 = performance.now();

    // Drop existing — safe for rebuild
    try { db.run('DROP TABLE IF EXISTS erp_search'); } catch (e) { /* ok */ }

    // Create FTS5 virtual table
    db.run(
      'CREATE VIRTUAL TABLE erp_search USING fts5(' +
      '  search_text,' +
      '  table_name UNINDEXED,' +
      '  record_id UNINDEXED,' +
      '  display_text UNINDEXED,' +
      '  window_id UNINDEXED,' +
      '  doc_status UNINDEXED,' +
      '  client UNINDEXED,' +
      '  tokenize = "porter unicode61"' +
      ')'
    );

    var totalRows = 0;
    for (var i = 0; i < SEARCHABLE.length; i++) {
      var s = SEARCHABLE[i];
      totalRows += _indexTable(db, s);
    }

    _indexed = true;
    var elapsed = Math.round(performance.now() - t0);
    console.log('§ERP_SEARCH buildIndex tables=' + SEARCHABLE.length +
                ' rows=' + totalRows + ' ms=' + elapsed);
    return { tables: SEARCHABLE.length, rows: totalRows, ms: elapsed };
  }

  function _indexTable(db, spec) {
    var keyCol = spec.table + '_ID';
    // Composite key tables
    if (spec.table === 'C_BPartner_Location') keyCol = 'C_BPartner_Location_ID';

    // Build SELECT with coalesce for nullable cols
    var parts = spec.cols.map(function (c) {
      return "COALESCE(" + c + ",'')";
    });
    var selectText = parts.join(" || ' ' || ");

    var docStatusCol = '';
    try {
      // Check if DocStatus exists
      db.exec('SELECT DocStatus FROM [' + spec.table + '] LIMIT 0');
      docStatusCol = ", DocStatus";
    } catch (e) { /* no DocStatus */ }

    var sql = 'SELECT ' + keyCol + ', ' + selectText + ', ' +
              spec.display + docStatusCol +
              ' FROM [' + spec.table + '] WHERE IsActive = \'Y\'';

    var count = 0;
    try {
      var r = db.exec(sql);
      if (r.length) {
        for (var j = 0; j < r[0].values.length; j++) {
          var row = r[0].values[j];
          var rid = row[0];
          var text = String(row[1] || '');
          var display = String(row[2] || '');
          var status = docStatusCol ? String(row[3] || '') : '';
          db.run(
            'INSERT INTO erp_search (search_text, table_name, record_id, display_text, window_id, doc_status, client) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?)',
            [text, spec.table, rid, display, spec.windowId || 0, status, spec.client || 'gardenworld']
          );
          count++;
        }
      }
    } catch (e) {
      // Table might not exist in this DB
      console.log('§ERP_SEARCH skip table=' + spec.table + ' err=' + e.message);
    }
    if (count > 0) {
      console.log('§ERP_SEARCH indexed table=' + spec.table + ' rows=' + count);
    }
    return count;
  }

  // ── Search ─────────────────────────────────────────────────────────

  /**
   * Search across all indexed data.
   * @param {string} query  user input
   * @param {number} [limit=20]
   * @returns {Array} [{table_name, record_id, display_text, window_id, doc_status, rank, snippet}]
   */
  /**
   * Search across all indexed data.
   * @param {string} query  user input
   * @param {number} [limit=20]
   * @param {string} [client]  'system' or 'gardenworld' — filter results
   * @returns {Array} [{table_name, record_id, display_text, window_id, doc_status, rank, snippet}]
   */
  function search(query, limit, client) {
    if (!_db || !_indexed) return [];
    if (!query || !query.trim()) return [];
    limit = limit || 20;

    var q = query.trim();
    var t0 = performance.now();

    // 1. Check document number patterns first
    var patternHit = _matchPattern(q);
    if (patternHit) {
      var results = _directSearch(patternHit.table, patternHit.column, q, patternHit.filter, limit);
      var elapsed = Math.round(performance.now() - t0);
      console.log('§ERP_SEARCH pattern query="' + q + '" table=' + patternHit.table +
                  ' hits=' + results.length + ' ms=' + elapsed);
      return results;
    }

    // 2. FTS5 search with BM25 ranking
    var ftsQuery = _buildFTSQuery(q);
    var results = [];
    try {
      var sql = 'SELECT table_name, record_id, display_text, window_id, doc_status, ' +
        'rank, snippet(erp_search, 0, \'<b>\', \'</b>\', \'...\', 32) ' +
        'FROM erp_search WHERE search_text MATCH ?';
      var params = [ftsQuery];
      if (client) {
        sql += ' AND client = ?';
        params.push(client);
      }
      sql += ' ORDER BY rank LIMIT ?';
      params.push(limit);
      var r = _db.exec(sql, params);
      if (r.length) {
        for (var i = 0; i < r[0].values.length; i++) {
          var row = r[0].values[i];
          results.push({
            table_name: row[0],
            record_id: row[1],
            display_text: row[2],
            window_id: row[3],
            doc_status: row[4],
            rank: row[5],
            snippet: row[6]
          });
        }
      }
    } catch (e) {
      console.log('§ERP_SEARCH fts5 error: ' + e.message + ' query="' + ftsQuery + '"');
      // Fallback: LIKE search
      results = _likeSearch(q, limit, client);
    }

    var elapsed = Math.round(performance.now() - t0);
    console.log('§ERP_SEARCH query="' + q + '" fts="' + ftsQuery + '" hits=' +
                results.length + ' ms=' + elapsed);
    return results;
  }

  function _matchPattern(q) {
    for (var i = 0; i < DOC_PATTERNS.length; i++) {
      if (DOC_PATTERNS[i].regex.test(q)) {
        return {
          table: DOC_PATTERNS[i].table,
          column: 'DocumentNo',
          filter: DOC_PATTERNS[i].filter || null
        };
      }
    }
    return null;
  }

  function _directSearch(table, column, q, filter, limit) {
    var sql = 'SELECT * FROM [' + table + '] WHERE ' + column + ' LIKE ?';
    if (filter) sql += ' AND ' + filter;
    sql += ' LIMIT ' + limit;

    var results = [];
    try {
      var spec = SEARCHABLE.find(function (s) { return s.table === table; });
      var r = _db.exec(sql, ['%' + q + '%']);
      if (r.length) {
        var cols = r[0].columns;
        for (var i = 0; i < r[0].values.length; i++) {
          var row = r[0].values[i];
          var obj = {};
          for (var c = 0; c < cols.length; c++) obj[cols[c]] = row[c];
          var keyCol = table + '_ID';
          results.push({
            table_name: table,
            record_id: obj[keyCol],
            display_text: obj[column] || obj.Name || '',
            window_id: spec ? spec.windowId : 0,
            doc_status: obj.DocStatus || '',
            rank: -100, // exact pattern match = top rank
            snippet: obj.Description || ''
          });
        }
      }
    } catch (e) {
      console.log('§ERP_SEARCH directSearch error: ' + e.message);
    }
    return results;
  }

  function _buildFTSQuery(q) {
    // Tokenize and add prefix matching for the last token (typeahead)
    var tokens = q.split(/\s+/).filter(function (t) { return t.length > 0; });
    if (!tokens.length) return '""';

    // Escape FTS5 special characters
    tokens = tokens.map(function (t) {
      return '"' + t.replace(/"/g, '""') + '"';
    });

    // Last token gets prefix match for typeahead
    var last = tokens[tokens.length - 1];
    tokens[tokens.length - 1] = last.slice(0, -1) + '"*';

    return tokens.join(' ');
  }

  function _likeSearch(q, limit, client) {
    var results = [];
    try {
      var sql = 'SELECT table_name, record_id, display_text, window_id, doc_status ' +
        'FROM erp_search WHERE search_text LIKE ?';
      var params = ['%' + q.replace(/%/g, '') + '%'];
      if (client) { sql += ' AND client = ?'; params.push(client); }
      sql += ' LIMIT ?'; params.push(limit);
      var r = _db.exec(sql, params);
      if (r.length) {
        for (var i = 0; i < r[0].values.length; i++) {
          var row = r[0].values[i];
          results.push({
            table_name: row[0], record_id: row[1], display_text: row[2],
            window_id: row[3], doc_status: row[4], rank: 0, snippet: ''
          });
        }
      }
    } catch (e) {
      console.log('§ERP_SEARCH likeSearch error: ' + e.message);
    }
    return results;
  }

  // ── Recent Changes ──────────────────────────────────────────────────

  /**
   * Get recent kernel_ops entries for the "Recent Changes" constellation.
   * @param {number} [limit=50]
   * @returns {Array} [{op_type, entity_id, user_tag, timestamp, table, record_id}]
   */
  function recentChanges(limit) {
    if (!_db) return [];
    limit = limit || 50;
    try {
      var r = _db.exec(
        'SELECT op_type, entity_id, user_tag, timestamp, ' +
        "json_extract(metadata, '$.table') as tbl, " +
        "json_extract(metadata, '$.id') as rid " +
        'FROM kernel_ops ORDER BY timestamp DESC LIMIT ?',
        [limit]
      );
      if (!r.length) return [];
      var results = [];
      for (var i = 0; i < r[0].values.length; i++) {
        var row = r[0].values[i];
        results.push({
          op_type: row[0], entity_id: row[1], user_tag: row[2],
          timestamp: row[3], table: row[4], record_id: row[5]
        });
      }
      console.log('§ERP_SEARCH recentChanges count=' + results.length);
      return results;
    } catch (e) {
      // kernel_ops might not exist
      return [];
    }
  }

  // ── Table type labels for display ──────────────────────────────────

  var TABLE_LABELS = {
    'C_BPartner': 'Business Partner',
    'M_Product': 'Product',
    'C_Order': 'Order',
    'C_Invoice': 'Invoice',
    'C_Payment': 'Payment',
    'M_InOut': 'Shipment',
    'C_Project': 'Project',
    'C_ElementValue': 'Account',
    'M_Product_Category': 'Category',
    'M_Warehouse': 'Warehouse',
    'C_BPartner_Location': 'Location',
    'AD_User': 'Contact',
    'C_DocType': 'Doc Type',
    'C_Country': 'Country',
    'C_Tax': 'Tax',
    'C_Charge': 'Charge',
    'C_BP_Group': 'BP Group',
    'AD_Window': 'Window',
    'AD_Table': 'Table',
    'AD_Menu': 'Menu',
    'AD_Tab': 'Tab',
    'AD_Reference': 'Reference',
    'AD_Element': 'Element'
  };

  function tableLabel(tableName) {
    return TABLE_LABELS[tableName] || tableName;
  }

  // ── Status colours ─────────────────────────────────────────────────

  var STATUS_COLOURS = {
    'DR': '#888',    // Drafted
    'IP': '#ff9f43', // In Progress
    'CO': '#54d9a8', // Completed
    'CL': '#54d9a8', // Closed
    'VO': '#ff5555', // Voided
    'RE': '#ff5555', // Reversed
    '':   '#6c9fff'  // No status (master data)
  };

  function statusColour(docStatus) {
    return STATUS_COLOURS[docStatus] || '#6c9fff';
  }

  // ── Incremental update (on save/delete) ────────────────────────────

  function updateRecord(db, tableName, recordId) {
    if (!_indexed) return;
    _db = db;
    var spec = SEARCHABLE.find(function (s) { return s.table === tableName; });
    if (!spec) return;

    // Remove old entry
    try {
      db.run('DELETE FROM erp_search WHERE table_name = ? AND record_id = ?',
             [tableName, recordId]);
    } catch (e) { /* ok */ }

    // Re-index single record
    var keyCol = tableName + '_ID';
    var parts = spec.cols.map(function (c) {
      return "COALESCE(" + c + ",'')";
    });
    var selectText = parts.join(" || ' ' || ");

    try {
      var r = db.exec(
        'SELECT ' + selectText + ', ' + spec.display +
        ' FROM [' + tableName + '] WHERE ' + keyCol + ' = ' + recordId +
        " AND IsActive = 'Y'"
      );
      if (r.length && r[0].values.length) {
        var text = String(r[0].values[0][0] || '');
        var display = String(r[0].values[0][1] || '');
        db.run(
          'INSERT INTO erp_search (search_text, table_name, record_id, display_text, window_id, doc_status, client) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?)',
          [text, tableName, recordId, display, spec.windowId || 0, '', spec.client || 'gardenworld']
        );
      }
    } catch (e) {
      console.log('§ERP_SEARCH updateRecord error: ' + e.message);
    }
    console.log('§ERP_SEARCH updateRecord table=' + tableName + ' id=' + recordId);
  }

  function removeRecord(tableName, recordId) {
    if (!_indexed || !_db) return;
    try {
      _db.run('DELETE FROM erp_search WHERE table_name = ? AND record_id = ?',
              [tableName, recordId]);
    } catch (e) { /* ok */ }
    console.log('§ERP_SEARCH removeRecord table=' + tableName + ' id=' + recordId);
  }

  // ── Stats ──────────────────────────────────────────────────────────

  function indexStats() {
    if (!_db || !_indexed) return { total: 0, tables: {} };
    var stats = { total: 0, tables: {} };
    try {
      var r = _db.exec(
        'SELECT table_name, COUNT(*) FROM erp_search GROUP BY table_name ORDER BY COUNT(*) DESC'
      );
      if (r.length) {
        for (var i = 0; i < r[0].values.length; i++) {
          var tbl = r[0].values[i][0];
          var cnt = Number(r[0].values[i][1]);
          stats.tables[tbl] = cnt;
          stats.total += cnt;
        }
      }
    } catch (e) { /* ok */ }
    return stats;
  }

  // ── Public API ─────────────────────────────────────────────────────

  var ERPSearch = {
    buildIndex:    buildIndex,
    search:        search,
    recentChanges: recentChanges,
    tableLabel:    tableLabel,
    statusColour:  statusColour,
    updateRecord:  updateRecord,
    removeRecord:  removeRecord,
    indexStats:    indexStats,
    isIndexed:     function () { return _indexed; }
  };

  if (typeof window !== 'undefined') window.ERPSearch = ERPSearch;
  if (typeof module !== 'undefined' && module.exports) module.exports = ERPSearch;

  console.log('§ERP_SEARCH_LOADED v1');
})();
