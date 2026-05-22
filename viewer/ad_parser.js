// ad_parser.js — iDempiere Application Dictionary parser for SQLite
// Implementing docs/ERP.md §3 — Witness: W-ERP-AD
// Reads AD_Menu, AD_Window, AD_Tab, AD_Field, AD_Column from SQLite.
// Returns structured objects. No rendering. No side effects except §-log.
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
(function () {
  'use strict';

  // ── Reference type map (iDempiere AD_Reference_ID → input type) ──

  var REF_TYPES = {
    10: 'string',     // String
    11: 'integer',    // Integer
    12: 'amount',     // Amount
    13: 'id',         // ID (hidden PK)
    14: 'text',       // Text (multiline)
    15: 'date',       // Date
    16: 'datetime',   // DateTime
    17: 'list',       // List (dropdown from AD_Ref_List)
    19: 'tableDirect', // TableDirect (FK lookup)
    20: 'table',      // Table (FK with validation rule)
    22: 'number',     // Number
    28: 'button',     // Button (DocAction)
    29: 'quantity',   // Quantity
    30: 'search',     // Search (typeahead)
    38: 'yesno'       // Yes-No (checkbox)
  };

  /**
   * Init: log AD table counts.
   * @param {Object} db  sql.js database
   */
  function init(db) {
    var counts = {};
    var tables = ['AD_Menu', 'AD_TreeNodeMM', 'AD_Window', 'AD_Tab', 'AD_Field',
                  'AD_Column', 'AD_Table', 'AD_Reference', 'AD_Ref_List', 'AD_Element'];
    for (var i = 0; i < tables.length; i++) {
      try {
        var r = db.exec('SELECT COUNT(*) FROM ' + tables[i]);
        counts[tables[i]] = r.length ? Number(r[0].values[0][0]) : 0;
      } catch (e) {
        counts[tables[i]] = -1;
      }
    }
    console.log('§AD_PARSER init menu=' + counts.AD_Menu + ' windows=' + counts.AD_Window +
                ' tabs=' + counts.AD_Tab + ' fields=' + counts.AD_Field +
                ' columns=' + counts.AD_Column + ' tables=' + counts.AD_Table);
    return counts;
  }

  // ── Menu Tree ──────────────────────────────────────────────────────

  /**
   * Build the full AD menu tree from AD_Menu + AD_TreeNodeMM.
   * @param {Object} db  sql.js database
   * @returns {Array} root-level menu nodes with children
   */
  function getMenuTree(db) {
    console.log('§AD_PARSER getMenuTree enter');

    // Get all menu nodes
    var menuR = db.exec(
      'SELECT m.AD_Menu_ID, m.Name, m.Description, m.IsSummary, m.Action, m.AD_Window_ID ' +
      'FROM AD_Menu m WHERE m.IsActive = \'Y\' ORDER BY m.Name');
    if (!menuR.length) { console.log('§AD_PARSER getMenuTree no menus'); return []; }

    var menuMap = {};
    menuR[0].values.forEach(function (row) {
      menuMap[row[0]] = {
        id: row[0], name: (row[1] || '').trim(), description: row[2],
        isSummary: row[3] === 'Y', action: row[4], windowId: row[5],
        children: []
      };
    });

    // Get tree hierarchy (AD_Tree_ID = 10 = main menu)
    var treeR = db.exec(
      'SELECT Node_ID, Parent_ID, SeqNo FROM AD_TreeNodeMM ' +
      'WHERE AD_Tree_ID = 10 AND IsActive = \'Y\' ORDER BY SeqNo');
    if (!treeR.length) { console.log('§AD_PARSER getMenuTree no tree nodes'); return []; }

    var roots = [];
    treeR[0].values.forEach(function (row) {
      var nodeId = row[0], parentId = row[1];
      var node = menuMap[nodeId];
      if (!node) return;

      if (parentId === 0 || !menuMap[parentId]) {
        roots.push(node);
      } else {
        menuMap[parentId].children.push(node);
      }
    });

    // Sort children by SeqNo (already ordered by query)
    console.log('§AD_PARSER getMenuTree nodes=' + Object.keys(menuMap).length +
                ' roots=' + roots.length);
    return roots;
  }

  // ── Window ─────────────────────────────────────────────────────────

  /**
   * Get a window definition with its tabs.
   * @param {Object} db        sql.js database
   * @param {number} windowId  AD_Window_ID
   * @returns {Object|null} { id, name, description, windowType, tabs: [...] }
   */
  function getWindow(db, windowId) {
    console.log('§AD_PARSER getWindow id=' + windowId);

    var winR = db.exec(
      'SELECT AD_Window_ID, Name, Description, Help, WindowType ' +
      'FROM AD_Window WHERE AD_Window_ID = ? AND IsActive = \'Y\'', [windowId]);
    if (!winR.length || !winR[0].values.length) {
      console.log('§AD_PARSER getWindow not found id=' + windowId);
      return null;
    }

    var row = winR[0].values[0];
    var win = {
      id: row[0], name: row[1], description: row[2],
      help: row[3], windowType: row[4],
      tabs: getTabs(db, windowId)
    };

    console.log('§AD_PARSER getWindow id=' + windowId + ' name=' + win.name +
                ' tabs=' + win.tabs.length);
    return win;
  }

  // ── Tabs ───────────────────────────────────────────────────────────

  /**
   * Get all tabs for a window.
   * @param {Object} db        sql.js database
   * @param {number} windowId  AD_Window_ID
   * @returns {Array} sorted by SeqNo, each with fields
   */
  function getTabs(db, windowId) {
    console.log('§AD_PARSER getTabs windowId=' + windowId);

    var tabR = db.exec(
      'SELECT t.AD_Tab_ID, t.Name, t.Description, t.Help, t.AD_Table_ID, ' +
      '       t.TabLevel, t.SeqNo, t.IsSingleRow, t.IsReadOnly, ' +
      '       t.WhereClause, t.OrderByClause, tbl.TableName ' +
      'FROM AD_Tab t ' +
      'LEFT JOIN AD_Table tbl ON t.AD_Table_ID = tbl.AD_Table_ID ' +
      'WHERE t.AD_Window_ID = ? AND t.IsActive = \'Y\' ' +
      'ORDER BY t.SeqNo', [windowId]);

    if (!tabR.length) return [];

    var tabs = tabR[0].values.map(function (row) {
      return {
        id: row[0], name: row[1], description: row[2], help: row[3],
        tableId: row[4], tabLevel: row[5], seqNo: row[6],
        isSingleRow: row[7] === 'Y', isReadOnly: row[8] === 'Y',
        whereClause: row[9], orderByClause: row[10],
        tableName: row[11],
        fields: getFields(db, row[0])
      };
    });

    console.log('§AD_PARSER getTabs windowId=' + windowId + ' count=' + tabs.length);
    return tabs;
  }

  // ── Fields ─────────────────────────────────────────────────────────

  /**
   * Get all fields for a tab, joined with AD_Column metadata.
   * @param {Object} db    sql.js database
   * @param {number} tabId AD_Tab_ID
   * @returns {Array} sorted by SeqNo
   */
  function getFields(db, tabId) {
    var fieldR = db.exec(
      'SELECT f.AD_Field_ID, f.Name, f.Description, f.SeqNo, ' +
      '       f.IsDisplayed, f.DisplayLogic, f.IsMandatory, f.IsReadOnly, f.DefaultValue, ' +
      '       c.AD_Column_ID, c.ColumnName, c.AD_Reference_ID, c.FieldLength, ' +
      '       c.IsMandatory as ColMandatory, c.IsKey, c.IsIdentifier, ' +
      '       c.DefaultValue as ColDefault ' +
      'FROM AD_Field f ' +
      'JOIN AD_Column c ON f.AD_Column_ID = c.AD_Column_ID ' +
      'WHERE f.AD_Tab_ID = ? AND f.IsActive = \'Y\' ' +
      'ORDER BY f.SeqNo', [tabId]);

    if (!fieldR.length) return [];

    var fields = fieldR[0].values.map(function (row) {
      var refId = row[11];
      return {
        id: row[0], name: row[1], description: row[2], seqNo: row[3],
        isDisplayed: row[4] === 'Y',
        displayLogic: row[5],
        isMandatory: (row[6] || row[13]) === 'Y',
        isReadOnly: row[7] === 'Y',
        defaultValue: row[8] || row[16],
        columnId: row[9], columnName: row[10],
        referenceId: refId,
        referenceType: REF_TYPES[refId] || 'string',
        fieldLength: row[12],
        isKey: row[14] === 'Y',
        isIdentifier: row[15] === 'Y'
      };
    });

    // Log only at tab level to avoid noise (fields can be 40+ per tab)
    console.log('§AD_PARSER getFields tabId=' + tabId + ' count=' + fields.length);
    return fields;
  }

  // ── Reference resolution ───────────────────────────────────────────

  /**
   * Resolve a reference to its options (for List type) or table info (for Table type).
   * @param {Object} db          sql.js database
   * @param {number} referenceId AD_Reference_ID
   * @returns {Object} { type: 'list', options: [...] } or { type: 'table', tableName, keyCol, displayCol }
   */
  function resolveReference(db, referenceId) {
    console.log('§AD_PARSER resolveRef id=' + referenceId);

    var refR = db.exec(
      'SELECT ValidationType FROM AD_Reference WHERE AD_Reference_ID = ?', [referenceId]);
    if (!refR.length || !refR[0].values.length) {
      return { type: 'unknown', referenceId: referenceId };
    }

    var valType = refR[0].values[0][0];

    if (valType === 'L') {
      // List — get options from AD_Ref_List
      var listR = db.exec(
        'SELECT Value, Name, Description FROM AD_Ref_List ' +
        'WHERE AD_Reference_ID = ? AND IsActive = \'Y\' ORDER BY Name', [referenceId]);
      var options = [];
      if (listR.length) {
        options = listR[0].values.map(function (row) {
          return { value: row[0], name: row[1], description: row[2] };
        });
      }
      console.log('§AD_PARSER resolveRef id=' + referenceId + ' type=List options=' + options.length);
      return { type: 'list', options: options };
    }

    console.log('§AD_PARSER resolveRef id=' + referenceId + ' type=' + valType);
    return { type: valType || 'unknown', referenceId: referenceId };
  }

  // ── Table name lookup ──────────────────────────────────────────────

  /**
   * Get table name from AD_Table_ID.
   */
  function getTableName(db, tableId) {
    var r = db.exec('SELECT TableName FROM AD_Table WHERE AD_Table_ID = ?', [tableId]);
    return (r.length && r[0].values.length) ? r[0].values[0][0] : null;
  }

  /**
   * Get window ID from menu node's AD_Window_ID.
   * For Action='W' menu nodes.
   */
  function getWindowFromMenu(db, menuId) {
    var r = db.exec(
      'SELECT AD_Window_ID FROM AD_Menu WHERE AD_Menu_ID = ? AND Action = \'W\'', [menuId]);
    return (r.length && r[0].values.length) ? r[0].values[0][0] : null;
  }

  // ── DisplayLogic evaluator ─────────────────────────────────────────

  /**
   * Parse and evaluate iDempiere display logic string.
   * Format: @ColumnName@='value' & @Other@!''
   * @param {string} logic   display logic expression
   * @param {Object} record  current record values { ColumnName: value }
   * @returns {boolean} true = display, false = hide
   */
  function evaluateDisplayLogic(logic, record) {
    if (!logic || !logic.trim()) return true;

    // Replace @ColumnName@ with record values
    var expr = logic.replace(/@(\w+)@/g, function (_, col) {
      var val = record[col];
      return val !== undefined && val !== null ? String(val) : '';
    });

    // Split by & (AND) and | (OR)
    // Simple evaluator — handles = and ! operators
    try {
      var andParts = expr.split('&');
      for (var i = 0; i < andParts.length; i++) {
        var orParts = andParts[i].split('|');
        var orResult = false;
        for (var j = 0; j < orParts.length; j++) {
          var part = orParts[j].trim();
          if (_evalCondition(part)) { orResult = true; break; }
        }
        if (!orResult) return false;
      }
      return true;
    } catch (e) {
      console.log('§AD_PARSER displayLogic error: ' + e.message + ' expr=' + logic);
      return true; // default: show
    }
  }

  function _evalCondition(cond) {
    // Handle: left='value', left!='value', left='', left!''
    // Left side may be empty (when @Column@ resolved to '')
    var m = cond.match(/^(.*?)\s*(!=|=|!|<>)\s*'?([^']*)'?\s*$/);
    if (!m) return true;
    var left = m[1].trim().replace(/^'|'$/g, '');
    var op = m[2];
    var right = m[3];
    if (op === '=' || op === '==') return left === right;
    if (op === '!' || op === '!=' || op === '<>') return left !== right;
    return true;
  }

  // ── Public API ─────────────────────────────────────────────────────

  var ADParser = {
    init:                 init,
    getMenuTree:          getMenuTree,
    getWindow:            getWindow,
    getTabs:              getTabs,
    getFields:            getFields,
    resolveReference:     resolveReference,
    getTableName:         getTableName,
    getWindowFromMenu:    getWindowFromMenu,
    evaluateDisplayLogic: evaluateDisplayLogic,
    REF_TYPES:            REF_TYPES
  };

  if (typeof window !== 'undefined') window.ADParser = ADParser;
  if (typeof module !== 'undefined' && module.exports) module.exports = ADParser;

  console.log('§AD_PARSER_LOADED v1');
})();
