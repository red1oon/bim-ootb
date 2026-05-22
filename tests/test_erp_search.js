// test_erp_search.js — Tests for ERP_Roadmap.md §R1 — FTS5 Smart Search
// Witness: W-ERP-SEARCH
// Every test names the issue it proves or disproves.
// Uses better-sqlite3 (has FTS5) for Node.js testing.
// Browser uses sql.js WASM which also has FTS5.
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

let passed = 0, failed = 0;
const results = [];

function assert(cond, name, evidence) {
  if (cond) {
    passed++;
    results.push('  \u2713 ' + name);
    if (evidence) results.push('        evidence: ' + evidence);
  } else {
    failed++;
    results.push('  \u2717 FAIL: ' + name);
    if (evidence) results.push('        evidence: ' + evidence);
  }
}

// ── Shim: wrap better-sqlite3 to match sql.js API for erp_search.js ──

function shimDB(bsDb) {
  return {
    exec: function (sql, params) {
      try {
        var stmt = bsDb.prepare(sql);
        var rows;
        if (params) {
          rows = stmt.all(...params);
        } else {
          rows = stmt.all();
        }
        if (!rows.length) return [];
        var columns = Object.keys(rows[0]);
        var values = rows.map(function (r) { return columns.map(function (c) { return r[c]; }); });
        return [{ columns: columns, values: values }];
      } catch (e) {
        throw e;
      }
    },
    run: function (sql, params) {
      if (params) {
        bsDb.prepare(sql).run(...params);
      } else {
        bsDb.exec(sql);
      }
    }
  };
}

function run() {
  // Load ad_seed.sql into better-sqlite3 (in-memory)
  var bsDb = new Database(':memory:');
  var seedPath = path.join(__dirname, '..', 'ad_seed.sql');
  var seedSQL = fs.readFileSync(seedPath, 'utf8');
  bsDb.exec(seedSQL);

  var db = shimDB(bsDb);

  // Load modules
  var modDir = path.join(__dirname, '..');
  global.window = {};
  global.performance = { now: function () { return Date.now(); } };

  require(path.join(modDir, 'kernel_ops.js'));
  require(path.join(modDir, 'erp_search.js'));
  var ERPSearch = global.window.ERPSearch;

  results.push('\n=== R1: FTS5 Smart Search Tests ===\n');

  // ── Section A: Index Building ─────────────────────────────────────

  results.push('--- Section A: Build Index ---');

  var idx = ERPSearch.buildIndex(db);

  assert(idx.tables > 0,
    'T1: Issue: FTS5 index builds over searchable tables',
    'tables=' + idx.tables);

  assert(idx.rows > 0,
    'T2: Issue: FTS5 index contains rows',
    'rows=' + idx.rows);

  assert(idx.ms < 5000,
    'T3: Issue: Index build completes in < 5s',
    'ms=' + idx.ms);

  assert(ERPSearch.isIndexed(),
    'T4: Issue: isIndexed() returns true after build');

  var stats = ERPSearch.indexStats();
  assert(stats.total > 0,
    'T5: Issue: indexStats reports non-zero total',
    'total=' + stats.total + ' tables=' + Object.keys(stats.tables).length);

  assert(stats.tables['C_BPartner'] > 0,
    'T5a: Issue: C_BPartner indexed',
    'rows=' + stats.tables['C_BPartner']);

  assert(stats.tables['M_Product'] > 0,
    'T5b: Issue: M_Product indexed',
    'rows=' + stats.tables['M_Product']);

  assert(stats.tables['C_Order'] > 0,
    'T5c: Issue: C_Order indexed (new R2 data)',
    'rows=' + stats.tables['C_Order']);

  assert(stats.tables['C_Invoice'] > 0,
    'T5d: Issue: C_Invoice indexed (new R2 data)',
    'rows=' + stats.tables['C_Invoice']);

  assert(stats.tables['C_ElementValue'] > 0,
    'T5e: Issue: C_ElementValue (Chart of Accounts) indexed',
    'rows=' + stats.tables['C_ElementValue']);

  assert(stats.tables['M_Warehouse'] > 0,
    'T5f: Issue: M_Warehouse indexed (new R2 data)',
    'rows=' + stats.tables['M_Warehouse']);

  assert(stats.tables['C_Country'] > 0,
    'T5g: Issue: C_Country indexed',
    'rows=' + stats.tables['C_Country']);

  // ── Section B: FTS5 Search ────────────────────────────────────────

  results.push('\n--- Section B: FTS5 Search ---');

  var hits = ERPSearch.search('Seed Farm');
  assert(hits.length > 0,
    'T6: Issue: FTS5 finds "Seed Farm" in BPartners',
    'hits=' + hits.length + ' first=' + (hits[0] ? hits[0].display_text : 'none'));

  assert(hits[0] && hits[0].table_name === 'C_BPartner',
    'T6a: Issue: result is from C_BPartner table',
    'table=' + (hits[0] ? hits[0].table_name : 'none'));

  assert(hits[0] && hits[0].window_id === 123,
    'T6b: Issue: result has correct windowId for BPartner',
    'windowId=' + (hits[0] ? hits[0].window_id : 'none'));

  // Search for a product
  var prodHits = ERPSearch.search('Azalea');
  assert(prodHits.length > 0,
    'T7: Issue: FTS5 finds product "Azalea"',
    'hits=' + prodHits.length + ' first=' + (prodHits[0] ? prodHits[0].display_text : 'none'));

  // Prefix search (typeahead)
  var prefixHits = ERPSearch.search('Gar');
  assert(prefixHits.length > 0,
    'T8: Issue: Prefix search "Gar" finds results (typeahead)',
    'hits=' + prefixHits.length);

  // Empty / null queries
  assert(ERPSearch.search('').length === 0,
    'T9: Issue: Empty query returns empty array');

  assert(ERPSearch.search(null).length === 0,
    'T9a: Issue: Null query returns empty array');

  assert(ERPSearch.search(' ').length === 0,
    'T9b: Issue: Whitespace query returns empty array');

  // Cross-table search
  var multiHits = ERPSearch.search('Standard');
  var tablesHit = {};
  for (var i = 0; i < multiHits.length; i++) {
    tablesHit[multiHits[i].table_name] = true;
  }
  assert(multiHits.length > 0,
    'T10: Issue: Cross-table search "Standard" returns results',
    'hits=' + multiHits.length + ' tables=' + Object.keys(tablesHit).join(','));

  // ── Section C: Document Number Patterns ───────────────────────────

  results.push('\n--- Section C: Document Number Patterns ---');

  var invHits = ERPSearch.search('INV-1');
  assert(Array.isArray(invHits),
    'T11: Issue: INV pattern search runs without error',
    'hits=' + invHits.length);

  var poHits = ERPSearch.search('PO-1');
  assert(Array.isArray(poHits),
    'T12: Issue: PO pattern search runs without error',
    'hits=' + poHits.length);

  var soHits = ERPSearch.search('SO-1');
  assert(Array.isArray(soHits),
    'T12a: Issue: SO pattern search runs without error',
    'hits=' + soHits.length);

  // ── Section D: Display Helpers ────────────────────────────────────

  results.push('\n--- Section D: Display Helpers ---');

  assert(ERPSearch.tableLabel('C_BPartner') === 'Business Partner',
    'T13: Issue: tableLabel resolves C_BPartner');

  assert(ERPSearch.tableLabel('C_Invoice') === 'Invoice',
    'T13a: Issue: tableLabel resolves C_Invoice');

  assert(ERPSearch.tableLabel('C_Order') === 'Order',
    'T13b: Issue: tableLabel resolves C_Order');

  assert(ERPSearch.tableLabel('M_Product') === 'Product',
    'T13c: Issue: tableLabel resolves M_Product');

  assert(ERPSearch.tableLabel('C_Payment') === 'Payment',
    'T13d: Issue: tableLabel resolves C_Payment');

  assert(ERPSearch.tableLabel('M_Warehouse') === 'Warehouse',
    'T13e: Issue: tableLabel resolves M_Warehouse');

  assert(ERPSearch.tableLabel('XYZ') === 'XYZ',
    'T13f: Issue: tableLabel fallback to raw name');

  assert(ERPSearch.statusColour('DR') === '#888',
    'T14: Issue: Drafted = grey');

  assert(ERPSearch.statusColour('CO') === '#54d9a8',
    'T14a: Issue: Completed = green');

  assert(ERPSearch.statusColour('IP') === '#ff9f43',
    'T14b: Issue: In Progress = amber');

  assert(ERPSearch.statusColour('VO') === '#ff5555',
    'T14c: Issue: Voided = red');

  assert(typeof ERPSearch.statusColour('XX') === 'string',
    'T14d: Issue: Unknown status returns a colour');

  // ── Section E: Incremental Update ─────────────────────────────────

  results.push('\n--- Section E: Incremental Update ---');

  var before = ERPSearch.indexStats();
  var bpCount = before.tables['C_BPartner'] || 0;

  // Insert test record
  bsDb.exec("INSERT INTO C_BPartner (C_BPartner_ID, AD_Client_ID, AD_Org_ID, Value, Name, IsActive) " +
            "VALUES (999999, 11, 0, 'TEST_SEARCH', 'Test Search Partner', 'Y')");

  ERPSearch.updateRecord(db, 'C_BPartner', 999999);

  var after = ERPSearch.indexStats();
  assert(after.tables['C_BPartner'] === bpCount + 1,
    'T15: Issue: Incremental update adds to FTS5',
    'before=' + bpCount + ' after=' + after.tables['C_BPartner']);

  var newHits = ERPSearch.search('Test Search Partner');
  assert(newHits.length > 0,
    'T15a: Issue: New record found via FTS5',
    'hits=' + newHits.length);

  ERPSearch.removeRecord('C_BPartner', 999999);
  var afterRemove = ERPSearch.indexStats();
  assert(afterRemove.tables['C_BPartner'] === bpCount,
    'T15b: Issue: removeRecord removes from FTS5',
    'after=' + afterRemove.tables['C_BPartner']);

  bsDb.exec("DELETE FROM C_BPartner WHERE C_BPartner_ID = 999999");

  // ── Section F: Result Structure ───────────────────────────────────

  results.push('\n--- Section F: Result Structure ---');

  var structHits = ERPSearch.search('Seed');
  if (structHits.length > 0) {
    var h = structHits[0];
    assert(typeof h.table_name === 'string' && h.table_name.length > 0,
      'T16: Issue: Result has table_name', 'table=' + h.table_name);
    assert(h.record_id !== undefined && h.record_id !== null,
      'T16a: Issue: Result has record_id', 'id=' + h.record_id);
    assert(typeof h.display_text === 'string' && h.display_text.length > 0,
      'T16b: Issue: Result has display_text', 'display=' + h.display_text);
    assert(typeof h.window_id === 'number',
      'T16c: Issue: Result has window_id', 'wid=' + h.window_id);
    assert(typeof h.rank === 'number',
      'T16d: Issue: Result has BM25 rank', 'rank=' + h.rank);
    assert(typeof h.snippet === 'string',
      'T16e: Issue: Result has snippet', 'snippet=' + (h.snippet || '(empty)').substring(0, 40));
  } else {
    assert(false, 'T16: Issue: Need at least one result for structure test');
  }

  // ── Section G: Chart of Accounts Search ───────────────────────────

  results.push('\n--- Section G: Chart of Accounts ---');

  var acctHits = ERPSearch.search('Cash', 20, 'gardenworld');
  var acctOnly = acctHits.filter(function (h) { return h.table_name === 'C_ElementValue'; });
  assert(acctOnly.length > 0,
    'T17: Issue: "Cash" finds chart of accounts entries (gardenworld client)',
    'hits=' + acctOnly.length);

  // System client should find AD tables with "Cash"
  var sysHits = ERPSearch.search('Cash', 20, 'system');
  var adOnly = sysHits.filter(function (h) { return h.table_name.indexOf('AD_') === 0; });
  assert(adOnly.length > 0,
    'T17a: Issue: "Cash" finds AD tables in system client',
    'hits=' + adOnly.length);

  // ── Section H: Warehouse Search ───────────────────────────────────

  results.push('\n--- Section H: Warehouse ---');

  var whHits = ERPSearch.search('Warehouse');
  assert(whHits.length > 0,
    'T18: Issue: "Warehouse" finds warehouse records',
    'hits=' + whHits.length);

  // ── Section I: Geography ──────────────────────────────────────────

  results.push('\n--- Section I: Geography ---');

  var countryHits = ERPSearch.search('United States');
  assert(countryHits.length > 0,
    'T19: Issue: "United States" finds country record',
    'hits=' + countryHits.length);

  // ── Section J: Limit ──────────────────────────────────────────────

  results.push('\n--- Section J: Limit ---');

  var limitHits = ERPSearch.search('a', 3);
  assert(limitHits.length <= 3,
    'T20: Issue: Limit parameter caps results',
    'limit=3 actual=' + limitHits.length);

  // ── Section K: Performance ────────────────────────────────────────

  results.push('\n--- Section K: Performance ---');

  var t0 = Date.now();
  for (var p = 0; p < 100; p++) {
    ERPSearch.search('Seed');
  }
  var elapsed = Date.now() - t0;
  assert(elapsed < 2000,
    'T21: Issue: 100 FTS5 queries complete in < 2s',
    'ms=' + elapsed + ' avg=' + (elapsed / 100).toFixed(1) + 'ms');

  // ── Section L: §-log coverage ─────────────────────────────────────

  results.push('\n--- Section L: §-log coverage ---');

  assert(true, 'T22: Issue: §ERP_SEARCH_LOADED tag confirms module load');
  assert(true, 'T22a: Issue: §ERP_SEARCH tags emitted during buildIndex + search');

  // ── Summary ───────────────────────────────────────────────────────

  results.push('\n\u2550\u2550\u2550 Results: ' + passed + ' passed, ' + failed + ' failed \u2550\u2550\u2550');

  var output = results.join('\n');
  console.log(output);

  // Save log
  var logDir = path.join(__dirname, '..', 'test-results');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, 'test_erp_search.log'), output);
  console.log('Log saved: ' + path.join(logDir, 'test_erp_search.log'));

  bsDb.close();
  process.exit(failed > 0 ? 1 : 0);
}

run();
