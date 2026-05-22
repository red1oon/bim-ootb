// doc_engine.js — Implementing SpatialERP_POC.md §0b, §3.1, §5 — Witness: W-SERP-P0
// Core engine: table creation + StateMachine + JournalEngine.
// P0 only — headless, no UI. §-tagged logging is primary verification.
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
(function () {
  'use strict';

  // ── §3.1 Table definitions ──────────────────────────────────────────

  var TABLE_SQLS = [
    // §TAB_CONTAINERS
    'CREATE TABLE IF NOT EXISTS containers (' +
    '  id TEXT PRIMARY KEY,' +
    '  parent_id TEXT REFERENCES containers(id),' +
    '  name TEXT NOT NULL,' +
    '  category TEXT NOT NULL,' +
    '  geometry_id TEXT,' +
    '  x REAL DEFAULT 0, y REAL DEFAULT 0, z REAL DEFAULT 0,' +
    '  metadata TEXT DEFAULT \'{}\')',

    // §TAB_ITEMS
    'CREATE TABLE IF NOT EXISTS items (' +
    '  id TEXT PRIMARY KEY,' +
    '  container_id TEXT REFERENCES containers(id),' +
    '  product_ref TEXT,' +
    '  name TEXT,' +
    '  qty REAL DEFAULT 1,' +
    '  geometry_id TEXT,' +
    '  x REAL DEFAULT 0, y REAL DEFAULT 0, z REAL DEFAULT 0,' +
    '  metadata TEXT DEFAULT \'{}\')',

    // §TAB_DOCUMENTS
    'CREATE TABLE IF NOT EXISTS documents (' +
    '  id TEXT PRIMARY KEY,' +
    '  doc_type TEXT NOT NULL,' +
    '  doc_status TEXT DEFAULT \'DRAFT\',' +
    '  created TEXT NOT NULL,' +
    '  completed TEXT,' +
    '  description TEXT,' +
    '  metadata TEXT DEFAULT \'{}\')',

    // §TAB_DOC_LINES
    'CREATE TABLE IF NOT EXISTS document_lines (' +
    '  id TEXT PRIMARY KEY,' +
    '  doc_id TEXT REFERENCES documents(id),' +
    '  item_id TEXT,' +
    '  container_id TEXT,' +
    '  qty REAL,' +
    '  unit_price REAL,' +
    '  metadata TEXT DEFAULT \'{}\')',

    // §TAB_JOURNAL
    'CREATE TABLE IF NOT EXISTS journal (' +
    '  id TEXT PRIMARY KEY,' +
    '  doc_id TEXT REFERENCES documents(id),' +
    '  line_id TEXT,' +
    '  account TEXT NOT NULL,' +
    '  debit REAL DEFAULT 0,' +
    '  credit REAL DEFAULT 0,' +
    '  timestamp TEXT NOT NULL)',

    // §TAB_REGISTRY
    'CREATE TABLE IF NOT EXISTS category_registry (' +
    '  category TEXT PRIMARY KEY,' +
    '  domain TEXT,' +
    '  json_schema TEXT,' +
    '  default_geometry TEXT,' +
    '  actions TEXT,' +
    '  heatmap_rule TEXT,' +
    '  label_template TEXT)'
  ];

  var _tablesCreated = false;

  function createTables(db) {
    console.log('§DOC_ENGINE createTables enter');
    for (var i = 0; i < TABLE_SQLS.length; i++) {
      db.run(TABLE_SQLS[i]);
    }
    _tablesCreated = true;
    console.log('§DOC_ENGINE createTables done count=' + TABLE_SQLS.length);
  }

  function ensureTables(db) {
    if (_tablesCreated) return;
    createTables(db);
  }

  // ── §5 State Machine ───────────────────────────────────────────────
  //
  // 5 states: DRAFT → IN_PROGRESS → COMPLETED / VOIDED / REVERSED
  // Events: start, complete, void, reverse
  // Invalid transition returns null.

  var TRANSITIONS = {
    DRAFT:       { start: 'IN_PROGRESS', void: 'VOIDED' },
    IN_PROGRESS: { complete: 'COMPLETED', void: 'VOIDED' },
    COMPLETED:   { reverse: 'REVERSED' },
    VOIDED:      {},
    REVERSED:    {}
  };

  /**
   * Transition a document through the state machine.
   * @param {Object} db      sql.js database
   * @param {string} docId   document id
   * @param {string} event   start | complete | void | reverse
   * @returns {{ new_status: string, old_status: string, side_effects: Array }|null}
   */
  function transition(db, docId, event) {
    console.log('§DOC_TRANSITION enter doc=' + docId + ' event=' + event);
    ensureTables(db);

    var r = db.exec('SELECT doc_status FROM documents WHERE id = ?', [docId]);
    if (!r.length || !r[0].values.length) {
      console.log('§DOC_TRANSITION doc not found id=' + docId);
      return null;
    }
    var current = r[0].values[0][0];
    console.log('§DOC_TRANSITION current_status=' + current);

    var allowed = TRANSITIONS[current];
    if (!allowed || !allowed[event]) {
      console.log('§DOC_TRANSITION invalid event=' + event + ' from=' + current);
      return null;
    }

    var newStatus = allowed[event];
    var completedVal = (newStatus === 'COMPLETED') ? new Date().toISOString() : null;

    db.run(
      'UPDATE documents SET doc_status = ?, completed = COALESCE(?, completed) WHERE id = ?',
      [newStatus, completedVal, docId]
    );

    var sideEffects = [];
    if (newStatus === 'COMPLETED') {
      sideEffects = journalPost(db, docId);
    } else if (newStatus === 'REVERSED') {
      sideEffects = journalReverse(db, docId);
    }

    console.log('§DOC_TRANSITION result doc=' + docId + ' from=' + current +
                ' to=' + newStatus + ' side_effects=' + sideEffects.length);
    return { new_status: newStatus, old_status: current, side_effects: sideEffects };
  }

  // ── JournalEngine — auto-post on COMPLETED ──────────────────────────
  //
  // Rule-based by doc_type. Each rule defines debit/credit accounts.
  // Journal entries are balanced: total debit = total credit.

  var JOURNAL_RULES = {
    LAND_LEAD:       { debit: 'LAND_ACQUISITION',   credit: 'CASH' },
    DEV_PLAN:        { debit: 'CONSTRUCTION_WIP',   credit: 'PROFESSIONAL_FEES' },
    DEV_BOQ:         { debit: 'CONSTRUCTION_WIP',   credit: 'CASH' },
    PURCHASE_ORDER:  { debit: 'CONSTRUCTION_WIP',   credit: 'ACCOUNTS_PAYABLE' },
    INVOICE:         { debit: 'ACCOUNTS_RECEIVABLE', credit: 'REVENUE' }
  };

  /**
   * Auto-post journal entries for a completed document.
   * Reads document_lines to compute totals.
   * @param {Object} db     sql.js database
   * @param {string} docId  document id
   * @returns {Array} journal entry ids created
   */
  function journalPost(db, docId) {
    console.log('§JOURNAL_POST enter doc=' + docId);

    var docR = db.exec('SELECT doc_type FROM documents WHERE id = ?', [docId]);
    if (!docR.length || !docR[0].values.length) {
      console.log('§JOURNAL_POST doc not found id=' + docId);
      return [];
    }
    var docType = docR[0].values[0][0];
    var rule = JOURNAL_RULES[docType];
    if (!rule) {
      console.log('§JOURNAL_POST no rule for doc_type=' + docType);
      return [];
    }

    // Sum line totals (qty * unit_price)
    var lineR = db.exec(
      'SELECT COALESCE(SUM(qty * unit_price), 0) FROM document_lines WHERE doc_id = ?',
      [docId]
    );
    var total = (lineR.length && lineR[0].values.length) ? Number(lineR[0].values[0][0]) : 0;
    if (total === 0) {
      // If no lines, use 0 — still post for audit trail
      console.log('§JOURNAL_POST no lines, posting zero-value entries');
    }

    var ts = new Date().toISOString();
    var debitId = 'JRN-' + docId + '-D';
    var creditId = 'JRN-' + docId + '-C';

    db.run(
      'INSERT INTO journal (id, doc_id, line_id, account, debit, credit, timestamp) ' +
      'VALUES (?, ?, NULL, ?, ?, 0, ?)',
      [debitId, docId, rule.debit, total, ts]
    );
    db.run(
      'INSERT INTO journal (id, doc_id, line_id, account, debit, credit, timestamp) ' +
      'VALUES (?, ?, NULL, ?, 0, ?, ?)',
      [creditId, docId, rule.credit, total, ts]
    );

    console.log('§JOURNAL_POST done doc=' + docId + ' type=' + docType +
                ' debit=' + rule.debit + ' credit=' + rule.credit +
                ' amount=' + total + ' entries=2');
    return [debitId, creditId];
  }

  // ── JournalEngine — auto-reverse on REVERSED ────────────────────────
  //
  // Posts counter-entries for every existing journal entry on the document.
  // Swaps debit↔credit. Linked via REV- prefix. Auditors see both the
  // original posting AND the reversal — no data is deleted.
  // This is what SAP does with reversal documents (FB08/MBST) but in one function.

  /**
   * Reverse all journal entries for a document.
   * @param {Object} db     sql.js database
   * @param {string} docId  document id
   * @returns {Array} reversal journal entry ids created
   */
  function journalReverse(db, docId) {
    console.log('§JOURNAL_REVERSE enter doc=' + docId);

    var existing = db.exec(
      'SELECT id, account, debit, credit FROM journal WHERE doc_id = ? AND id NOT LIKE \'REV-%\'',
      [docId]
    );
    if (!existing.length || !existing[0].values.length) {
      console.log('§JOURNAL_REVERSE no entries to reverse doc=' + docId);
      return [];
    }

    var ts = new Date().toISOString();
    var reversalIds = [];

    for (var i = 0; i < existing[0].values.length; i++) {
      var row = existing[0].values[i];
      var origId = row[0];
      var account = row[1];
      var origDebit = Number(row[2]);
      var origCredit = Number(row[3]);
      var revId = 'REV-' + origId;

      // Counter-entry: swap debit and credit
      db.run(
        'INSERT INTO journal (id, doc_id, line_id, account, debit, credit, timestamp) ' +
        'VALUES (?, ?, NULL, ?, ?, ?, ?)',
        [revId, docId, account, origCredit, origDebit, ts]
      );
      reversalIds.push(revId);
    }

    console.log('§JOURNAL_REVERSE done doc=' + docId +
                ' reversed=' + reversalIds.length + ' entries');
    return reversalIds;
  }

  /**
   * Query journal balance for an account.
   * @returns {{ debit: number, credit: number, net: number }}
   */
  function accountBalance(db, account) {
    ensureTables(db);
    var r = db.exec(
      'SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) FROM journal WHERE account = ?',
      [account]
    );
    var debit = 0, credit = 0;
    if (r.length && r[0].values.length) {
      debit = Number(r[0].values[0][0]);
      credit = Number(r[0].values[0][1]);
    }
    console.log('§JOURNAL_BALANCE account=' + account + ' debit=' + debit + ' credit=' + credit);
    return { debit: debit, credit: credit, net: debit - credit };
  }

  // ── Public API ──────────────────────────────────────────────────────

  var DocEngine = {
    createTables:    createTables,
    ensureTables:    ensureTables,
    transition:      transition,
    journalPost:     journalPost,
    journalReverse:  journalReverse,
    accountBalance:  accountBalance,
    TRANSITIONS:     TRANSITIONS,
    JOURNAL_RULES:   JOURNAL_RULES
  };

  if (typeof window !== 'undefined') {
    window.DocEngine = DocEngine;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DocEngine;
  }

  console.log('§DOC_ENGINE_LOADED v1');
})();
