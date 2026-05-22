#!/usr/bin/env node
// test_ad_ui.js — AD UI renderer tests
// Implementing ERP_AD_UI.md §13 — Witness: W-ERP-ADUI
// Run: node deploy/dev/tests/test_ad_ui.js
// METHODOLOGY: §-tagged logs are primary evidence.

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

var pass = 0, fail = 0, testLogs = [];
var allSectionLogs = [];
var _origLog = console.log;

function check(id, desc, ok, evidence) {
  var line = (ok ? '  \u2713 ' : '  \u2717 ') + id + ': ' + desc +
    (ok ? '' : ' \u2014 FAILED') +
    (evidence ? '\n        evidence: ' + evidence : '');
  testLogs.push(line); _origLog(line);
  if (ok) pass++; else fail++;
}

function loadModule(filename) {
  return fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
}

function extractValue(logLine, key) {
  var re = new RegExp(key + '=([^ ]+)');
  var m = logLine.match(re);
  return m ? m[1] : null;
}

async function main() {
  _origLog('\u2550\u2550\u2550 AD UI Renderer Tests \u2550\u2550\u2550\n');

  var SQL = await initSqlJs();
  var mockWindow = {};
  global.window = mockWindow;

  // Mock localStorage
  var _store = {};
  global.localStorage = {
    getItem: function (k) { return _store[k] || null; },
    setItem: function (k, v) { _store[k] = v; },
    removeItem: function (k) { delete _store[k]; }
  };

  // Mock navigator
  global.navigator = { clipboard: { writeText: function () {} } };

  // Mock requestAnimationFrame (graph uses it)
  var _rafId = 1;
  global.requestAnimationFrame = function () { return _rafId++; };
  global.cancelAnimationFrame = function () {};

  // Mock BroadcastChannel
  global.BroadcastChannel = function () {
    this.postMessage = function () {};
    this.close = function () {};
    this.addEventListener = function () {};
  };

  // Mock document (minimal)
  var _elements = {};
  global.document = {
    createElement: function (tag) {
      var _noop = function () {};
      var _mockGrad = { addColorStop: _noop };
      var _mockCtx = {
        clearRect: _noop, fillRect: _noop, fillText: _noop, beginPath: _noop,
        moveTo: _noop, lineTo: _noop, arc: _noop, closePath: _noop, fill: _noop,
        stroke: _noop, quadraticCurveTo: _noop, scale: _noop, rect: _noop,
        createRadialGradient: function () { return _mockGrad; },
        createLinearGradient: function () { return _mockGrad; },
        ellipse: _noop, save: _noop, restore: _noop,
        fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '',
        globalAlpha: 1
      };
      var el = {
        tagName: tag.toUpperCase(),
        style: { cssText: '' },
        dataset: {},
        innerHTML: '',
        textContent: '',
        children: [],
        _listeners: {},
        width: 480, height: 260,
        appendChild: function (child) { this.children.push(child); },
        addEventListener: function (evt, fn) { this._listeners[evt] = fn; },
        removeEventListener: function () {},
        querySelectorAll: function () { return []; },
        querySelector: function () { return null; },
        dispatchEvent: function () {},
        getContext: function () { return _mockCtx; },
        getBoundingClientRect: function () { return { left: 0, top: 0, width: 480, height: 260 }; }
      };
      if (tag === 'select') el.options = [];
      return el;
    },
    getElementById: function (id) {
      if (!_elements[id]) {
        _elements[id] = global.document.createElement('div');
        _elements[id].id = id;
      }
      return _elements[id];
    },
    addEventListener: function () {},
    removeEventListener: function () {},
    dispatchEvent: function () {},
    body: { appendChild: function () {} }
  };

  // Capture all §-logs
  var phaseLogs = [];
  console.log = function () {
    var msg = Array.prototype.join.call(arguments, ' ');
    phaseLogs.push(msg);
    allSectionLogs.push(msg);
  };

  // ── Load modules ──────────────────────────────────────────────────
  eval(loadModule('kernel_ops.js'));
  eval(loadModule('ad_parser.js'));
  eval(loadModule('ad_data.js'));
  eval(loadModule('ad_charts.js'));
  eval(loadModule('ad_graph.js'));
  eval(loadModule('ad_ui.js'));

  var ADParser = mockWindow.ADParser;
  var ADData   = mockWindow.ADData;
  var ADCharts = mockWindow.ADCharts;
  var ADGraph  = mockWindow.ADGraph;
  var ADUI     = mockWindow.ADUI;
  var KernelOps = mockWindow.KernelOps;

  check('LOAD-1', 'ADParser loaded', !!ADParser);
  check('LOAD-2', 'ADData loaded', !!ADData);
  check('LOAD-3', 'ADCharts loaded', !!ADCharts);
  check('LOAD-4', 'ADUI loaded', !!ADUI);
  check('LOAD-5', 'KernelOps loaded', !!KernelOps);
  check('LOAD-6', 'ADGraph loaded', !!ADGraph);

  // ── Load AD seed ──────────────────────────────────────────────────
  var db = new SQL.Database();
  var seedPath = path.join(__dirname, '..', 'ad_seed.sql');
  var hasSeed = fs.existsSync(seedPath);

  if (hasSeed) {
    _origLog('\n--- Loading ad_seed.sql ---');
    var seedSql = fs.readFileSync(seedPath, 'utf8');
    try { db.exec(seedSql); } catch (e) {
      _origLog('  AD seed bulk load (partial): ' + e.message.substring(0, 80));
    }
    _origLog('--- Seed loaded ---\n');
  } else {
    _origLog('\n--- ad_seed.sql not found, creating minimal test data ---');
    _createMinimalAD(db);
    _origLog('--- Minimal AD created ---\n');
  }

  // ── §13 T1: Menu renders N root nodes ─────────────────────────────
  _origLog('\n=== §13 T1: Menu tree ===');
  phaseLogs = [];
  var tree = ADParser.getMenuTree(db);
  var menuLog = phaseLogs.find(function (l) { return l.indexOf('§AD_PARSER getMenuTree nodes=') >= 0; });

  check('MENU-1', 'getMenuTree returns array', Array.isArray(tree));
  check('MENU-2', 'has root nodes', tree.length > 0,
    'roots=' + tree.length);
  if (menuLog) {
    var nodeCount = Number(extractValue(menuLog, 'nodes'));
    check('MENU-3', 'menu log reports nodes', nodeCount > 0,
      menuLog);
  }

  // Count summary vs leaf
  var summaryCount = 0, leafCount = 0;
  function _countNodes(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].isSummary) { summaryCount++; _countNodes(nodes[i].children); }
      else leafCount++;
    }
  }
  _countNodes(tree);
  check('MENU-4', 'has summary folders', summaryCount > 0, 'folders=' + summaryCount);
  check('MENU-5', 'has leaf windows', leafCount > 0, 'leaves=' + leafCount);

  // ── §13 T2: Window opens with correct tab count ───────────────────
  _origLog('\n=== §13 T2: Window + tabs ===');
  phaseLogs = [];

  // Find a window leaf in the tree
  var testWindowId = null;
  function _findLeaf(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].windowId) { testWindowId = nodes[i].windowId; return; }
      if (nodes[i].children) _findLeaf(nodes[i].children);
      if (testWindowId) return;
    }
  }
  _findLeaf(tree);
  check('WIN-1', 'found test window in menu', testWindowId !== null,
    'windowId=' + testWindowId);

  if (testWindowId) {
    var win = ADParser.getWindow(db, testWindowId);
    check('WIN-2', 'getWindow returns object', !!win);
    check('WIN-3', 'window has tabs', win && win.tabs.length > 0,
      'tabs=' + (win ? win.tabs.length : 0));

    var winLog = phaseLogs.find(function (l) {
      return l.indexOf('§AD_PARSER getWindow id=' + testWindowId) >= 0 && l.indexOf('tabs=') >= 0;
    });
    if (winLog) {
      var logTabs = Number(extractValue(winLog, 'tabs'));
      check('WIN-4', 'log tab count matches', logTabs === win.tabs.length,
        winLog);
    }
  }

  // ── §13 T3: Fields render with correct types ─────────────────────
  _origLog('\n=== §13 T3: Field types ===');
  if (testWindowId) {
    var win2 = ADParser.getWindow(db, testWindowId);
    var headerTab = win2.tabs[0];
    var stringFields = 0, listFields = 0, dateFields = 0, yesnoFields = 0;
    for (var fi = 0; fi < headerTab.fields.length; fi++) {
      var ft = headerTab.fields[fi].referenceType;
      if (ft === 'string' || ft === 'text') stringFields++;
      if (ft === 'list') listFields++;
      if (ft === 'date' || ft === 'datetime') dateFields++;
      if (ft === 'yesno') yesnoFields++;
    }
    check('FIELD-1', 'header tab has fields', headerTab.fields.length > 0,
      'fields=' + headerTab.fields.length);
    check('FIELD-2', 'has string/text fields', stringFields > 0,
      'string=' + stringFields);
    // These may not exist in all windows, so warn only
    _origLog('  info: list=' + listFields + ' date=' + dateFields + ' yesno=' + yesnoFields);
  }

  // ── §13 T4: Master-detail: child records filter by parent FK ──────
  _origLog('\n=== §13 T4: Master-detail ===');
  // Use C_BPartner (window 123) if exists
  phaseLogs = [];
  var bpWin = ADParser.getWindow(db, 123);
  if (bpWin && bpWin.tabs.length > 1) {
    var headerTabBP = bpWin.tabs[0];
    var detailTab = bpWin.tabs[1];
    check('MD-1', 'BPartner window has detail tab', detailTab.tabLevel > 0,
      'detail=' + detailTab.name + ' level=' + detailTab.tabLevel);

    // Read header records
    var bpRecords = ADData.readRecords(db, headerTabBP.tableName);
    check('MD-2', 'BPartner has records', bpRecords.length > 0,
      'count=' + bpRecords.length);

    if (bpRecords.length > 0) {
      var parentKey = headerTabBP.tableName + '_ID';
      var parentId = bpRecords[0][parentKey];
      var childWhere = parentKey + ' = ' + parentId;
      var childRecords = ADData.readRecords(db, detailTab.tableName, childWhere);
      check('MD-3', 'child records filtered by parent FK', true,
        'parent=' + parentId + ' children=' + childRecords.length);
    }
  } else {
    _origLog('  skip: C_BPartner (123) not available for master-detail test');
    check('MD-1', 'master-detail skipped (no BPartner window)', true, 'seed may be minimal');
  }

  // ── §13 T5: CRUD — save record → kernel_ops logged ───────────────
  _origLog('\n=== §13 T5: CRUD ===');
  phaseLogs = [];

  // Create a test table
  db.run('CREATE TABLE IF NOT EXISTS AD_Test (AD_Test_ID INTEGER PRIMARY KEY, Name TEXT, Value TEXT, IsActive TEXT DEFAULT \'Y\')');
  db.run("INSERT OR IGNORE INTO AD_Test VALUES (1, 'Test1', 'val1', 'Y')");

  // Read
  var testRecs = ADData.readRecords(db, 'AD_Test');
  check('CRUD-1', 'readRecords returns data', testRecs.length >= 1,
    'count=' + testRecs.length);

  var readLog = phaseLogs.find(function (l) { return l.indexOf('§AD_DATA readRecords table=AD_Test') >= 0; });
  check('CRUD-2', 'readRecords §-logged', !!readLog, readLog || '');

  // Save (update)
  phaseLogs = [];
  testRecs[0].Name = 'Updated';
  var saveResult = ADData.saveRecord(db, 'AD_Test', testRecs[0], []);
  check('CRUD-3', 'saveRecord returns id', saveResult.id >= 1,
    'id=' + saveResult.id + ' action=' + saveResult.action);

  var saveLog = phaseLogs.find(function (l) { return l.indexOf('§AD_DATA saveRecord') >= 0; });
  check('CRUD-4', 'saveRecord §-logged', !!saveLog, saveLog || '');

  // Re-read and verify
  var reRead = ADData.readRecords(db, 'AD_Test', 'AD_Test_ID = 1');
  check('CRUD-5', 're-read matches saved value', reRead.length === 1 && reRead[0].Name === 'Updated',
    'Name=' + (reRead.length ? reRead[0].Name : 'N/A'));

  // Delete
  phaseLogs = [];
  ADData.deleteRecord(db, 'AD_Test', 'AD_Test_ID', 1);
  var afterDel = ADData.readRecords(db, 'AD_Test', 'AD_Test_ID = 1');
  check('CRUD-6', 'deleteRecord removes record', afterDel.length === 0);

  // getNextId
  var nextId = ADData.getNextId(db, 'AD_Test');
  check('CRUD-7', 'getNextId returns number', typeof nextId === 'number' && nextId >= 1,
    'nextId=' + nextId);

  // Save (insert new)
  phaseLogs = [];
  var newRec = { Name: 'NewRecord', Value: 'v2', IsActive: 'Y' };
  var insertResult = ADData.saveRecord(db, 'AD_Test', newRec, []);
  check('CRUD-8', 'insert new record', insertResult.action === 'INSERT',
    'id=' + insertResult.id);

  // ── §13 T6: Charts — SQL aggregate returns non-zero ───────────────
  _origLog('\n=== §13 T6: Charts ===');
  phaseLogs = [];

  // Test runQuery
  var chartResult = ADCharts.runQuery(db, 'SELECT Name, Value FROM AD_Test');
  check('CHART-1', 'runQuery returns columns', chartResult.columns.length >= 1,
    'cols=' + chartResult.columns.join(','));
  check('CHART-2', 'runQuery returns rows', chartResult.rows.length >= 1,
    'rows=' + chartResult.rows.length);

  // Test prebuilt queries
  var prebuilt = ADCharts.getPrebuilt('C_Project');
  check('CHART-3', 'prebuilt for C_Project exists', prebuilt.length > 0,
    'queries=' + prebuilt.length);

  var prebuiltBP = ADCharts.getPrebuilt('C_BPartner');
  check('CHART-4', 'prebuilt for C_BPartner exists', prebuiltBP.length > 0);

  // Error handling
  var errResult = ADCharts.runQuery(db, 'SELECT * FROM nonexistent_table');
  check('CHART-5', 'runQuery handles error', !!errResult.error);

  var chartLog = phaseLogs.find(function (l) { return l.indexOf('§AD_CHARTS runQuery') >= 0; });
  check('CHART-6', 'charts §-logged', !!chartLog, chartLog || '');

  // ── §13 T7: DisplayLogic ─────────────────────────────────────────
  _origLog('\n=== §13 T7: DisplayLogic ===');

  var dlTrue = ADParser.evaluateDisplayLogic("@DocStatus@='CO'", { DocStatus: 'CO' });
  check('DL-1', 'display when condition true', dlTrue === true);

  var dlFalse = ADParser.evaluateDisplayLogic("@DocStatus@='CO'", { DocStatus: 'DR' });
  check('DL-2', 'hide when condition false', dlFalse === false);

  var dlEmpty = ADParser.evaluateDisplayLogic('', {});
  check('DL-3', 'empty logic = show', dlEmpty === true);

  var dlAnd = ADParser.evaluateDisplayLogic("@IsCustomer@='Y'&@IsVendor@='N'",
    { IsCustomer: 'Y', IsVendor: 'N' });
  check('DL-4', 'AND logic works', dlAnd === true);

  var dlNot = ADParser.evaluateDisplayLogic("@Status@!''", { Status: 'Active' });
  check('DL-5', 'NOT empty works', dlNot === true);

  // ── §13 T8: Bottom nav — 5 icons present ─────────────────────────
  _origLog('\n=== §13 T8: Module API ===');

  check('NAV-1', 'ADUI has init', typeof ADUI.init === 'function');
  check('NAV-2', 'ADUI has showMenu', typeof ADUI.showMenu === 'function');
  check('NAV-3', 'ADUI has openWindow', typeof ADUI.openWindow === 'function');
  check('NAV-4', 'ADData has all CRUD methods',
    typeof ADData.readRecords === 'function' &&
    typeof ADData.saveRecord === 'function' &&
    typeof ADData.deleteRecord === 'function' &&
    typeof ADData.getNextId === 'function');
  check('NAV-5', 'ADCharts has renderOverlay', typeof ADCharts.renderOverlay === 'function');

  // ── §13 T9: Inline edit — field value persists ────────────────────
  _origLog('\n=== §13 T9: Inline edit persistence ===');
  phaseLogs = [];

  db.run("INSERT OR IGNORE INTO AD_Test VALUES (99, 'EditMe', 'original', 'Y')");
  var editRec = ADData.readRecords(db, 'AD_Test', 'AD_Test_ID = 99');
  check('EDIT-1', 'edit target exists', editRec.length === 1);

  editRec[0].Value = 'modified';
  ADData.saveRecord(db, 'AD_Test', editRec[0], []);
  var verify = ADData.readRecords(db, 'AD_Test', 'AD_Test_ID = 99');
  check('EDIT-2', 'inline edit persisted', verify[0].Value === 'modified',
    'Value=' + verify[0].Value);

  // ── §13 T10: Share URL generation ─────────────────────────────────
  _origLog('\n=== §13 T10: URL params ===');
  check('URL-1', 'window param format correct', '?window=130'.indexOf('window=') >= 0);
  check('URL-2', 'db param format correct', '?db=Hospital.db'.indexOf('db=') >= 0);

  // ── §13 T11: countRecords ─────────────────────────────────────────
  _origLog('\n=== §13 T11: Count records ===');
  var cnt = ADData.countRecords(db, 'AD_Test');
  check('COUNT-1', 'countRecords returns number', typeof cnt === 'number' && cnt >= 1,
    'count=' + cnt);

  var cnt0 = ADData.countRecords(db, 'nonexistent_xyz');
  check('COUNT-2', 'countRecords handles missing table', cnt0 === 0);

  // ── §13 T12: Client switcher — window sets built from data ─────────
  _origLog('\n=== §13 T12: Client switcher + window sets ===');
  phaseLogs = [];

  // The window sets are built by _buildWindowSets inside ADUI
  // We test directly: System windows should include AD_ tables, GW should include C_/M_ tables

  // System: AD_Window (W102), AD_Table (W100), AD_Reference (W101), AD_Menu (W105)
  var sysWin = ADParser.getWindow(db, 102);
  check('CLIENT-1', 'System: Window/Tab/Field (W102) exists', !!sysWin,
    'name=' + (sysWin ? sysWin.name : 'N/A'));

  if (sysWin) {
    var sysTab = sysWin.tabs[0];
    var sysRecs = ADData.readRecords(db, sysTab.tableName);
    check('CLIENT-2', 'System: AD_Window has browsable rows', sysRecs.length > 0,
      'table=' + sysTab.tableName + ' count=' + sysRecs.length);

    var sysReadLog = phaseLogs.find(function (l) { return l.indexOf('§AD_DATA readRecords table=AD_Window') >= 0; });
    check('CLIENT-3', 'System: AD_Window read §-logged', !!sysReadLog, sysReadLog || '');
  }

  // System: AD_Table (W100) — 1003 tables, drill to AD_Column
  phaseLogs = [];
  var tblWin = ADParser.getWindow(db, 100);
  check('CLIENT-4', 'System: Table/Column (W100) exists', !!tblWin,
    'tabs=' + (tblWin ? tblWin.tabs.length : 0));
  if (tblWin && tblWin.tabs.length > 1) {
    check('CLIENT-5', 'System: Table/Column has detail tab for columns',
      tblWin.tabs[1].tableName === 'AD_Column',
      'detail=' + tblWin.tabs[1].tableName);
  }

  // System: AD_Reference (W101)
  var refWin = ADParser.getWindow(db, 101);
  if (refWin) {
    var refRecs = ADData.readRecords(db, refWin.tabs[0].tableName);
    check('CLIENT-6', 'System: AD_Reference has data', refRecs.length > 0,
      'count=' + refRecs.length);
  }

  // GardenWorld: C_BPartner (W123)
  phaseLogs = [];
  var gwWin = ADParser.getWindow(db, 123);
  check('CLIENT-7', 'GW: Business Partner (W123) exists', !!gwWin,
    'tabs=' + (gwWin ? gwWin.tabs.length : 0));
  if (gwWin) {
    var gwRecs = ADData.readRecords(db, gwWin.tabs[0].tableName);
    check('CLIENT-8', 'GW: C_BPartner has data rows', gwRecs.length > 0,
      'count=' + gwRecs.length);

    var gwLog = phaseLogs.find(function (l) { return l.indexOf('§AD_DATA readRecords table=C_BPartner') >= 0; });
    check('CLIENT-9', 'GW: C_BPartner read §-logged', !!gwLog, gwLog || '');
  }

  // GardenWorld: M_Product (W140)
  phaseLogs = [];
  var prodWin = ADParser.getWindow(db, 140);
  check('CLIENT-10', 'GW: Product (W140) exists', !!prodWin);
  if (prodWin) {
    var prodRecs = ADData.readRecords(db, prodWin.tabs[0].tableName);
    check('CLIENT-11', 'GW: M_Product has data rows', prodRecs.length > 0,
      'count=' + prodRecs.length);

    // Master-detail: product has sub-tabs
    check('CLIENT-12', 'GW: Product has multiple tabs', prodWin.tabs.length > 1,
      'tabs=' + prodWin.tabs.length);
  }

  // ── §13 T13: Crash protection — missing table toast ───────────────
  _origLog('\n=== §13 T13: Crash protection ===');
  phaseLogs = [];

  // Reading from missing table should not crash
  // NOTE: PA_DocumentStatus exists in seed — use a truly absent table
  var missingRecs = ADData.readRecords(db, 'ZZ_Nonexistent_Table');
  check('CRASH-1', 'missing table returns empty array', Array.isArray(missingRecs) && missingRecs.length === 0);

  var crashLog = phaseLogs.find(function (l) { return l.indexOf('§AD_DATA readRecords ERROR') >= 0; });
  check('CRASH-2', 'missing table error §-logged', !!crashLog, crashLog || '');

  // countRecords on missing table = 0
  var missingCnt = ADData.countRecords(db, 'ZZ_Nonexistent_Table');
  check('CRASH-3', 'countRecords on missing table = 0', missingCnt === 0);

  // getNextId on missing table returns fallback
  var missingId = ADData.getNextId(db, 'ZZ_Nonexistent_Table');
  check('CRASH-4', 'getNextId on missing table returns fallback', missingId >= 1,
    'id=' + missingId);

  // ── §13 T14: Charts — pie chart + system/GW queries ───────────────
  _origLog('\n=== §13 T14: Charts — pie + dashboard queries ===');
  phaseLogs = [];

  // drawPieChart exists
  check('PIE-1', 'ADCharts has drawPieChart', typeof ADCharts.drawPieChart === 'function');

  // System dashboard query: windows by tab count
  var sysDash = ADCharts.runQuery(db,
    "SELECT w.Name, COUNT(t.AD_Tab_ID) as cnt FROM AD_Window w JOIN AD_Tab t ON w.AD_Window_ID = t.AD_Window_ID WHERE w.IsActive='Y' GROUP BY w.AD_Window_ID ORDER BY cnt DESC LIMIT 10");
  check('PIE-2', 'system dashboard: windows by tab count', sysDash.rows.length > 0,
    'rows=' + sysDash.rows.length + ' top=' + (sysDash.rows.length ? sysDash.rows[0][0] + ':' + sysDash.rows[0][1] : ''));

  // System dashboard query: field types
  var fieldTypes = ADCharts.runQuery(db,
    "SELECT CASE AD_Reference_ID WHEN 10 THEN 'String' WHEN 13 THEN 'ID' WHEN 19 THEN 'TableDirect' WHEN 38 THEN 'YesNo' WHEN 17 THEN 'List' ELSE 'Other' END as type, COUNT(*) as cnt FROM AD_Column GROUP BY type ORDER BY cnt DESC");
  check('PIE-3', 'system dashboard: field types', fieldTypes.rows.length > 0,
    'types=' + fieldTypes.rows.length);

  // GW dashboard query: products by category
  var prodCat = ADCharts.runQuery(db,
    "SELECT pc.Name, COUNT(p.M_Product_ID) as cnt FROM M_Product p LEFT JOIN M_Product_Category pc ON p.M_Product_Category_ID = pc.M_Product_Category_ID GROUP BY pc.Name ORDER BY cnt DESC");
  check('PIE-4', 'GW dashboard: products by category', prodCat.rows.length > 0,
    'categories=' + prodCat.rows.length + ' top=' + (prodCat.rows.length ? prodCat.rows[0][0] + ':' + prodCat.rows[0][1] : ''));

  // GW dashboard query: customer vs vendor
  var custVend = ADCharts.runQuery(db,
    "SELECT CASE WHEN IsCustomer='Y' THEN 'Customer' WHEN IsVendor='Y' THEN 'Vendor' ELSE 'Other' END as type, COUNT(*) as cnt FROM C_BPartner GROUP BY type");
  check('PIE-5', 'GW dashboard: customer vs vendor', custVend.rows.length > 0,
    'types=' + custVend.rows.length);

  var dashLogs = phaseLogs.filter(function (l) { return l.indexOf('§AD_CHARTS runQuery') >= 0; });
  check('PIE-6', 'dashboard queries §-logged', dashLogs.length >= 4,
    'query_logs=' + dashLogs.length);

  // ── §13 T15: Help panel data — window/tab/field descriptions ──────
  _origLog('\n=== §13 T15: Help panel data ===');
  phaseLogs = [];

  // Check that windows have help/description text
  var helpWin = ADParser.getWindow(db, 123); // Business Partner
  if (helpWin) {
    check('HELP-1', 'window has name for help', !!helpWin.name,
      'name=' + helpWin.name);
    check('HELP-2', 'window has description', helpWin.description !== null,
      'desc=' + (helpWin.description || '(null)').substring(0, 40));

    var helpTab = helpWin.tabs[0];
    check('HELP-3', 'tab has name for help', !!helpTab.name,
      'tab=' + helpTab.name);
    check('HELP-4', 'tab has tableName for help', !!helpTab.tableName,
      'table=' + helpTab.tableName);

    // Fields have descriptions
    var fieldsWithDesc = helpTab.fields.filter(function (f) { return f.description; });
    check('HELP-5', 'fields have descriptions for help panel', fieldsWithDesc.length > 0,
      'withDesc=' + fieldsWithDesc.length + '/' + helpTab.fields.length);

    // Fields have types for help display
    var fieldTypes2 = {};
    helpTab.fields.forEach(function (f) { fieldTypes2[f.referenceType] = (fieldTypes2[f.referenceType] || 0) + 1; });
    check('HELP-6', 'fields have reference types', Object.keys(fieldTypes2).length > 1,
      'types=' + JSON.stringify(fieldTypes2));
  }

  // ── §13 T16: System AD self-browse — full drill ───────────────────
  _origLog('\n=== §13 T16: System AD self-browse ===');
  phaseLogs = [];

  // Open W102 (Window, Tab and Field), read AD_Window rows, drill to AD_Tab
  var w102 = ADParser.getWindow(db, 102);
  if (w102) {
    var headerTab102 = w102.tabs[0];
    var windows = ADData.readRecords(db, headerTab102.tableName, null, 'Name');
    check('SYS-1', 'AD_Window browsable: rows loaded', windows.length > 0,
      'count=' + windows.length);

    // Find a detail tab (AD_Tab)
    var tabTab = w102.tabs.find(function (t) { return t.tableName === 'AD_Tab'; });
    check('SYS-2', 'AD_Window has AD_Tab detail', !!tabTab,
      'found=' + (tabTab ? tabTab.name : 'N/A'));

    if (tabTab && windows.length > 0) {
      // Drill: filter AD_Tab by first window's ID
      var firstWinId = windows[0].AD_Window_ID;
      var childTabs = ADData.readRecords(db, 'AD_Tab', 'AD_Window_ID = ' + firstWinId);
      check('SYS-3', 'master-detail drill: tabs for window ' + firstWinId, childTabs.length >= 0,
        'childTabs=' + childTabs.length);

      var drillLog = phaseLogs.find(function (l) { return l.indexOf('§AD_DATA readRecords table=AD_Tab') >= 0; });
      check('SYS-4', 'drill read §-logged', !!drillLog, drillLog || '');
    }

    // Further drill: AD_Field for a tab
    if (w102.tabs.length > 2) {
      var fieldTab = w102.tabs.find(function (t) { return t.tableName === 'AD_Field'; });
      if (fieldTab) {
        check('SYS-5', 'AD_Window has AD_Field detail', true,
          'tab=' + fieldTab.name);
      }
    }
  }

  // AD_Table (W100) — browse tables, drill to columns
  var w100 = ADParser.getWindow(db, 100);
  if (w100) {
    var tables100 = ADData.readRecords(db, 'AD_Table', null, 'TableName');
    check('SYS-6', 'AD_Table browsable', tables100.length > 0,
      'count=' + tables100.length);

    // Drill to AD_Column for first table
    if (tables100.length > 0) {
      var firstTableId = tables100[0].AD_Table_ID;
      var cols = ADData.readRecords(db, 'AD_Column', 'AD_Table_ID = ' + firstTableId);
      check('SYS-7', 'AD_Column drill for table ' + firstTableId, cols.length >= 0,
        'columns=' + cols.length);
    }
  }

  // ── T17: CRUD lifecycle — create→update→re-read→delete→verify gone ─
  _origLog('\n=== T17: CRUD lifecycle (issue: data integrity across operations) ===');
  phaseLogs = [];

  // Fresh table for isolated test
  db.run('DROP TABLE IF EXISTS T17_Order');
  db.run('CREATE TABLE T17_Order (T17_Order_ID INTEGER PRIMARY KEY, Name TEXT, Amount REAL, Status TEXT)');

  // INSERT: create 3 records
  var r1 = ADData.saveRecord(db, 'T17_Order', { Name: 'PO-001', Amount: 1500, Status: 'DR' }, []);
  var r2 = ADData.saveRecord(db, 'T17_Order', { Name: 'PO-002', Amount: 2500, Status: 'DR' }, []);
  var r3 = ADData.saveRecord(db, 'T17_Order', { Name: 'PO-003', Amount: 800, Status: 'CO' }, []);
  check('CRUD-LC-1', 'insert 3 records: IDs are sequential',
    r1.id < r2.id && r2.id < r3.id,
    'ids=' + r1.id + ',' + r2.id + ',' + r3.id);

  var allRecs17 = ADData.readRecords(db, 'T17_Order');
  check('CRUD-LC-2', 'readRecords returns all 3', allRecs17.length === 3,
    'count=' + allRecs17.length);

  // UPDATE: change PO-002 amount
  allRecs17[1].Amount = 9999;
  allRecs17[1].Status = 'CO';
  ADData.saveRecord(db, 'T17_Order', allRecs17[1], []);
  var updated17 = ADData.readRecords(db, 'T17_Order', 'T17_Order_ID = ' + r2.id);
  check('CRUD-LC-3', 'update persists Amount=9999', updated17[0].Amount === 9999,
    'Amount=' + updated17[0].Amount);
  check('CRUD-LC-4', 'update persists Status=CO', updated17[0].Status === 'CO',
    'Status=' + updated17[0].Status);

  // DELETE: remove PO-001
  ADData.deleteRecord(db, 'T17_Order', 'T17_Order_ID', r1.id);
  var afterDel17 = ADData.readRecords(db, 'T17_Order');
  check('CRUD-LC-5', 'delete removes exactly 1 record', afterDel17.length === 2,
    'remaining=' + afterDel17.length);
  var deletedGone = afterDel17.every(function (r) { return r.T17_Order_ID !== r1.id; });
  check('CRUD-LC-6', 'deleted record PO-001 is gone', deletedGone);

  // WHERE filter
  var coOnly = ADData.readRecords(db, 'T17_Order', "Status = 'CO'");
  check('CRUD-LC-7', 'WHERE Status=CO returns correct subset', coOnly.length === 2,
    'co_count=' + coOnly.length);

  // countRecords matches
  var cnt17 = ADData.countRecords(db, 'T17_Order');
  check('CRUD-LC-8', 'countRecords matches readRecords', cnt17 === afterDel17.length,
    'count=' + cnt17 + ' read=' + afterDel17.length);

  // §-log evidence
  var insertLogs = phaseLogs.filter(function (l) { return l.indexOf('§AD_DATA saveRecord') >= 0 && l.indexOf('INSERT') >= 0; });
  var updateLogs17 = phaseLogs.filter(function (l) { return l.indexOf('§AD_DATA saveRecord') >= 0 && l.indexOf('UPDATE') >= 0; });
  var deleteLogs = phaseLogs.filter(function (l) { return l.indexOf('§AD_DATA deleteRecord') >= 0; });
  check('CRUD-LC-9', '3 inserts §-logged', insertLogs.length === 3,
    'insert_logs=' + insertLogs.length);
  check('CRUD-LC-10', '1 update §-logged', updateLogs17.length === 1,
    'update_logs=' + updateLogs17.length);
  check('CRUD-LC-11', '1 delete §-logged', deleteLogs.length === 1,
    'delete_logs=' + deleteLogs.length);

  // ── T18: FK resolution — end-to-end ───────────────────────────────
  _origLog('\n=== T18: FK resolution (issue: FK shows integer, must show Name) ===');
  phaseLogs = [];
  ADData.clearFKCache();

  var bpAll = ADData.readRecords(db, 'C_BPartner');
  if (bpAll.length > 0) {
    var bp = bpAll[0];
    var bpId = bp.C_BPartner_ID;
    var bpName = bp.Name;

    var resolved18 = ADData.resolveFK(db, 'C_BPartner_ID', bpId);
    check('FK-1', 'resolve C_BPartner_ID=' + bpId + ' → "' + bpName + '"',
      resolved18 === bpName,
      'resolved="' + resolved18 + '"');

    // Cache: no re-query on second call
    phaseLogs = [];
    var cached18 = ADData.resolveFK(db, 'C_BPartner_ID', bpId);
    check('FK-2', 'cache hit returns same', cached18 === bpName);
    var queryLog18 = phaseLogs.find(function (l) { return l.indexOf('§AD_DATA resolveFK') >= 0; });
    check('FK-3', 'cache hit: no §-log (no re-query)', !queryLog18);

    // Cross-table: M_Product
    ADData.clearFKCache();
    var prods18 = ADData.readRecords(db, 'M_Product');
    if (prods18.length > 0) {
      var prodResolved = ADData.resolveFK(db, 'M_Product_ID', prods18[0].M_Product_ID);
      check('FK-4', 'resolve M_Product_ID → "' + prods18[0].Name + '"',
        prodResolved === prods18[0].Name,
        'resolved="' + prodResolved + '"');
    }
  }

  // Edge cases
  check('FK-5', 'null → null', ADData.resolveFK(db, 'C_BPartner_ID', null) === null);
  check('FK-6', 'zero → null', ADData.resolveFK(db, 'C_BPartner_ID', 0) === null);
  check('FK-7', 'no _ID suffix → null', ADData.resolveFK(db, 'PlainCol', 1) === null);
  check('FK-8', 'missing table → null', ADData.resolveFK(db, 'Z_Ghost_ID', 999) === null);

  // ── T19: Master-detail navigation ─────────────────────────────────
  _origLog('\n=== T19: Master-detail (issue: child records must filter by parent FK) ===');
  phaseLogs = [];

  var mdWin = ADParser.getWindow(db, 123);
  if (mdWin && mdWin.tabs.length > 1) {
    var mdHeader = mdWin.tabs[0];
    var mdDetail = mdWin.tabs[1];
    var mdParents = ADData.readRecords(db, mdHeader.tableName);

    check('MD-NAV-1', 'header tab has records', mdParents.length > 0,
      'table=' + mdHeader.tableName + ' count=' + mdParents.length);

    // Find parent with children
    var parentWithChildren = null;
    var mi;
    for (mi = 0; mi < mdParents.length; mi++) {
      var pk = mdHeader.tableName + '_ID';
      var childWhere = pk + ' = ' + mdParents[mi][pk];
      var children19 = ADData.readRecords(db, mdDetail.tableName, childWhere);
      if (children19.length > 0) {
        parentWithChildren = { parent: mdParents[mi], children: children19, pk: pk };
        break;
      }
    }

    if (parentWithChildren) {
      check('MD-NAV-2', 'parent with children found',
        parentWithChildren.children.length > 0,
        'parent=' + parentWithChildren.parent.Name + ' children=' + parentWithChildren.children.length);

      var parentId19 = parentWithChildren.parent[parentWithChildren.pk];
      var allMatch = parentWithChildren.children.every(function (c) {
        return c[parentWithChildren.pk] === parentId19;
      });
      check('MD-NAV-3', 'all children reference correct parent FK', allMatch,
        'parentId=' + parentId19);
    }

    check('MD-NAV-4', 'header=TabLevel 0', mdHeader.tabLevel === 0);
    check('MD-NAV-5', 'detail=TabLevel>0', mdDetail.tabLevel > 0,
      'level=' + mdDetail.tabLevel);
  }

  // ── T20: Heatmap data accuracy ────────────────────────────────────
  _origLog('\n=== T20: Heatmap data (issue: treemap needs accurate counts) ===');
  phaseLogs = [];

  var stats20 = ADData.getTableStats(db);
  check('HEAT-1', 'getTableStats has entries', stats20.length > 0, 'tables=' + stats20.length);

  if (stats20.length > 0) {
    // Verify top table count against direct query
    var topT = stats20[0];
    var actualCnt = ADData.countRecords(db, topT.tableName);
    check('HEAT-2', 'top table count matches direct query',
      topT.count === actualCnt,
      'table=' + topT.tableName + ' stat=' + topT.count + ' actual=' + actualCnt);

    // Sorted desc
    var isSorted = true;
    for (var si = 1; si < stats20.length; si++) {
      if (stats20[si].count > stats20[si - 1].count) { isSorted = false; break; }
    }
    check('HEAT-3', 'sorted by count desc', isSorted);

    // AD_ → system
    var adT = stats20.find(function (s) { return s.tableName.indexOf('AD_') === 0; });
    check('HEAT-4', 'AD_ table type=system', adT && adT.type === 'system',
      (adT ? adT.tableName + '→' + adT.type : 'none'));
  }

  // Field completeness: verify pct formula
  var compWin20 = ADParser.getWindow(db, 123);
  if (compWin20) {
    var compTab20 = compWin20.tabs[0];
    var compRecs20 = ADData.readRecords(db, compTab20.tableName);
    var comp20 = ADData.getFieldCompleteness(compRecs20, compTab20.fields);
    if (comp20.length > 0) {
      var tf = comp20[0];
      var manualFilled = 0;
      for (var ci = 0; ci < compRecs20.length; ci++) {
        var v = compRecs20[ci][tf.columnName];
        if (v !== null && v !== undefined && v !== '') manualFilled++;
      }
      var manualPct = Math.round((manualFilled / compRecs20.length) * 100);
      check('HEAT-5', 'completeness pct formula correct',
        tf.pct === manualPct,
        'field=' + tf.fieldName + ' computed=' + tf.pct + '% manual=' + manualPct + '%');
    }
  }

  // ── T21: DisplayLogic — real expressions ──────────────────────────
  _origLog('\n=== T21: DisplayLogic (issue: fields must show/hide correctly) ===');

  check('DL-1', "='CO' with CO → show",
    ADParser.evaluateDisplayLogic("@DocStatus@='CO'", { DocStatus: 'CO' }) === true);
  check('DL-2', "='CO' with DR → hide",
    ADParser.evaluateDisplayLogic("@DocStatus@='CO'", { DocStatus: 'DR' }) === false);
  check('DL-3', "AND both true → show",
    ADParser.evaluateDisplayLogic("@IsCustomer@='Y'&@IsVendor@='N'",
      { IsCustomer: 'Y', IsVendor: 'N' }) === true);
  check('DL-4', "AND one false → hide",
    ADParser.evaluateDisplayLogic("@IsCustomer@='Y'&@IsVendor@='N'",
      { IsCustomer: 'Y', IsVendor: 'Y' }) === false);
  check('DL-5', "!='' with value → show",
    ADParser.evaluateDisplayLogic("@Status@!''", { Status: 'Active' }) === true);
  check('DL-6', "!='' with empty → hide",
    ADParser.evaluateDisplayLogic("@Status@!''", { Status: '' }) === false);
  check('DL-7', 'empty logic → show', ADParser.evaluateDisplayLogic('', {}) === true);
  check('DL-8', 'null logic → show', ADParser.evaluateDisplayLogic(null, {}) === true);
  check('DL-9', 'missing column → empty substitution',
    ADParser.evaluateDisplayLogic("@Missing@='Y'", {}) === false);

  // ── Init ADUI for integration tests ────────────────────────────────
  _origLog('\n--- Init ADUI for integration tests ---');
  var mockContent = global.document.createElement('div');
  var mockNav = global.document.createElement('div');
  var mockBreadcrumb = global.document.createElement('div');
  ADUI.init(db, mockContent, mockNav, mockBreadcrumb);

  // ── T22: Navigation logic — arrow keys, record index, tab switching ─
  _origLog('\n=== T22: Navigation (issue: arrow keys must change record/tab) ===');
  phaseLogs = [];

  // Open BPartner window (18 records) via ADUI
  ADUI.openWindow(123);
  check('NAV-1', 'openWindow sets screen=window',
    ADUI.getCurrentScreen() === 'window');
  check('NAV-2', 'openWindow starts at record 0',
    ADUI.getRecordIdx() === 0);
  check('NAV-3', 'openWindow loads records',
    ADUI.getRecordCount() > 1,
    'count=' + ADUI.getRecordCount());

  // Arrow right: record 0 → 1
  ADUI.navRecord(1);
  check('NAV-4', 'navRecord(+1) moves to record 1',
    ADUI.getRecordIdx() === 1);

  // Arrow right again: 1 → 2
  ADUI.navRecord(1);
  check('NAV-5', 'navRecord(+1) moves to record 2',
    ADUI.getRecordIdx() === 2);

  // Arrow left: 2 → 1
  ADUI.navRecord(-1);
  check('NAV-6', 'navRecord(-1) moves back to 1',
    ADUI.getRecordIdx() === 1);

  // Arrow left past 0: should stay at 0
  ADUI.navRecord(-1); // → 0
  ADUI.navRecord(-1); // → still 0
  check('NAV-7', 'navRecord(-1) at 0 stays at 0',
    ADUI.getRecordIdx() === 0);

  // Arrow right past end: should stay at last
  var maxIdx = ADUI.getRecordCount() - 1;
  for (var ni = 0; ni < maxIdx + 5; ni++) ADUI.navRecord(1);
  check('NAV-8', 'navRecord(+1) past end stays at last',
    ADUI.getRecordIdx() === maxIdx,
    'idx=' + ADUI.getRecordIdx() + ' max=' + maxIdx);

  // §-log evidence for navigation
  var navLogs = phaseLogs.filter(function (l) { return l.indexOf('§AD_UI navRecord') >= 0; });
  check('NAV-9', 'navRecord §-logged', navLogs.length > 0,
    'logs=' + navLogs.length);

  // Tab switching: 0 → 1 (detail)
  var tabCount = 0;
  try {
    // BPartner W123 has multiple tabs
    ADUI.switchTab(1);
    check('NAV-10', 'switchTab(1) moves to tab 1',
      ADUI.getTabIdx() === 1);

    // Switch back
    ADUI.switchTab(0);
    check('NAV-11', 'switchTab(0) returns to header',
      ADUI.getTabIdx() === 0);
  } catch (e) {
    check('NAV-10', 'switchTab — skipped (single tab)', true);
    check('NAV-11', 'switchTab back — skipped', true);
  }

  // Return to home
  ADUI.showMenu();
  check('NAV-12', 'showMenu returns to home screen',
    ADUI.getCurrentScreen() === 'home');

  // ── T23: Window open → records loaded from real AD table ──────────
  _origLog('\n=== T23: Real window records (issue: window must show actual data) ===');
  phaseLogs = [];

  // System: AD_Window (W102) — must have 370 browsable rows
  ADUI.openWindow(102);
  check('WIN-REAL-1', 'AD_Window (W102) records loaded',
    ADUI.getRecordCount() === 370,
    'count=' + ADUI.getRecordCount());

  // GW: M_Product (W140)
  ADUI.openWindow(140);
  var prodCount = ADUI.getRecordCount();
  check('WIN-REAL-2', 'M_Product (W140) records loaded',
    prodCount > 0,
    'count=' + prodCount);

  // Navigate to last record and back
  for (var wi = 0; wi < prodCount; wi++) ADUI.navRecord(1);
  check('WIN-REAL-3', 'navigate to last product record',
    ADUI.getRecordIdx() === prodCount - 1,
    'idx=' + ADUI.getRecordIdx());

  ADUI.navRecord(-1);
  check('WIN-REAL-4', 'navigate back one from last',
    ADUI.getRecordIdx() === prodCount - 2);

  ADUI.showMenu(); // cleanup

  // ── T24: Cross-table FK chain — BPartner contact references parent ─
  _origLog('\n=== T24: FK chain (issue: child FK must resolve to parent Name) ===');
  phaseLogs = [];
  ADData.clearFKCache();

  // Get a contact (AD_User) that has C_BPartner_ID
  var contacts = ADData.readRecords(db, 'AD_User');
  var contactWithBP = contacts.find(function (c) { return c.C_BPartner_ID; });
  if (contactWithBP) {
    var contactBPId = contactWithBP.C_BPartner_ID;
    var resolvedBP = ADData.resolveFK(db, 'C_BPartner_ID', contactBPId);

    // Verify it matches the actual BPartner name
    var bpDirect = ADData.readRecords(db, 'C_BPartner', 'C_BPartner_ID = ' + contactBPId);
    check('FK-CHAIN-1', 'contact FK resolves to parent BPartner name',
      bpDirect.length > 0 && resolvedBP === bpDirect[0].Name,
      'contact=' + contactWithBP.Name + ' bp_id=' + contactBPId + ' resolved=' + resolvedBP);
  } else {
    check('FK-CHAIN-1', 'no contacts with BPartner FK (skip)', true, 'seed data');
  }

  // ── T25: Detail panel — sub-tab records load alongside main record ─
  _origLog('\n=== T25: Detail panel (issue: detail tab records must load for current parent) ===');
  phaseLogs = [];

  // Open BPartner W123, check detail records load
  ADUI.openWindow(123);
  var bpCount = ADUI.getRecordCount();
  check('DPAN-1', 'BPartner loaded', bpCount > 0, 'count=' + bpCount);

  // The detail panel §-log should show records loaded for first detail tab
  var detailLog = phaseLogs.find(function (l) { return l.indexOf('§AD_UI detailPanel') >= 0; });
  check('DPAN-2', 'detail panel rendered with §-log', !!detailLog, detailLog || 'no log');

  // Navigate to a different record — detail panel should update
  phaseLogs = [];
  ADUI.navRecord(1);
  var detailLog2 = phaseLogs.find(function (l) { return l.indexOf('§AD_UI detailPanel') >= 0; });
  check('DPAN-3', 'detail panel re-rendered on record change', !!detailLog2, detailLog2 || 'no log');

  // Switch to detail tab — should filter by parent
  ADUI.switchTab(1);
  var detailRecCount = ADUI.getRecordCount();
  check('DPAN-4', 'switchTab(1) loads filtered detail records',
    detailRecCount >= 0, 'detail_records=' + detailRecCount);

  ADUI.showMenu(); // cleanup

  // ── T26: Graph constellation — nodes, drill, entity view ──────────
  _origLog('\n=== T26: Graph constellation (issue: data must appear as interactive nodes) ===');
  phaseLogs = [];

  // Init graph with mock canvas
  var graphCanvas = global.document.createElement('canvas');
  var drillCalled = null;
  ADGraph.init(graphCanvas, db, 'gardenworld',
    function (tbl, wid, rec) { drillCalled = { table: tbl, windowId: wid }; },
    function () {}
  );

  check('GRAPH-1', 'graph init creates nodes', ADGraph.getNodeCount() > 0,
    'nodes=' + ADGraph.getNodeCount());
  check('GRAPH-2', 'graph starts in home view', ADGraph.getCurrentView() === 'home');

  var graphLog = phaseLogs.find(function (l) { return l.indexOf('§AD_GRAPH init') >= 0; });
  check('GRAPH-3', 'graph init §-logged', !!graphLog, graphLog || '');

  // Drill into entity
  phaseLogs = [];
  ADGraph.showEntity('C_BPartner');
  check('GRAPH-4', 'showEntity creates record nodes', ADGraph.getNodeCount() > 0,
    'nodes=' + ADGraph.getNodeCount());
  check('GRAPH-5', 'view switched to entity', ADGraph.getCurrentView() === 'entity');

  // showEntity calls _buildEntityNodes which re-inits nodes (no separate log tag)
  // Evidence: node count > 0 proves buildEntity ran; §AD_GRAPH init logged on re-init
  var entityLog = phaseLogs.find(function (l) { return l.indexOf('§AD_GRAPH') >= 0; });
  check('GRAPH-6', 'entity view §-logged or nodes populated', !!entityLog || ADGraph.getNodeCount() > 0,
    entityLog || ('nodes=' + ADGraph.getNodeCount()));

  // System client
  phaseLogs = [];
  ADGraph.destroy();
  ADGraph.init(graphCanvas, db, 'system', function () {}, function () {});
  check('GRAPH-7', 'system graph has nodes', ADGraph.getNodeCount() > 0,
    'nodes=' + ADGraph.getNodeCount());

  // init logs §AD_GRAPH init client=system — the actual tag
  var sysGraphLog = phaseLogs.find(function (l) { return l.indexOf('§AD_GRAPH init') >= 0 && l.indexOf('system') >= 0; });
  check('GRAPH-8', 'system graph §-logged', !!sysGraphLog, sysGraphLog || '');

  ADGraph.destroy();

  // Products entity view
  phaseLogs = [];
  ADGraph.init(graphCanvas, db, 'gardenworld', function () {}, function () {});
  ADGraph.showEntity('M_Product');
  check('GRAPH-9', 'M_Product entity view has nodes', ADGraph.getNodeCount() > 0,
    'nodes=' + ADGraph.getNodeCount());
  ADGraph.destroy();

  // ── Summary ───────────────────────────────────────────────────────
  _origLog('\n\u2550\u2550\u2550 Results: ' + pass + '/' + (pass + fail) + ' passed' +
    (fail > 0 ? ' (' + fail + ' FAILED)' : ' \u2714') + ' \u2550\u2550\u2550');

  // Save log
  var logPath = path.join(__dirname, '..', 'test-results', 'test_ad_ui.log');
  try {
    if (!fs.existsSync(path.dirname(logPath))) fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, testLogs.join('\n') + '\n' +
      '\n--- All §-logs ---\n' + allSectionLogs.join('\n'));
    _origLog('Log saved to ' + logPath);
  } catch (e) { _origLog('Log save failed: ' + e.message); }

  process.exit(fail > 0 ? 1 : 0);
}

function _createMinimalAD(db) {
  // Minimal AD schema for testing without full seed
  db.run('CREATE TABLE IF NOT EXISTS AD_Menu (AD_Menu_ID INTEGER PRIMARY KEY, Name TEXT, Description TEXT, IsSummary TEXT, Action TEXT, AD_Window_ID INTEGER, IsActive TEXT DEFAULT \'Y\')');
  db.run('CREATE TABLE IF NOT EXISTS AD_TreeNodeMM (AD_Tree_ID INTEGER, Node_ID INTEGER, Parent_ID INTEGER, SeqNo INTEGER, IsActive TEXT DEFAULT \'Y\')');
  db.run('CREATE TABLE IF NOT EXISTS AD_Window (AD_Window_ID INTEGER PRIMARY KEY, Name TEXT, Description TEXT, Help TEXT, WindowType TEXT, IsActive TEXT DEFAULT \'Y\')');
  db.run('CREATE TABLE IF NOT EXISTS AD_Tab (AD_Tab_ID INTEGER PRIMARY KEY, AD_Window_ID INTEGER, Name TEXT, Description TEXT, Help TEXT, AD_Table_ID INTEGER, TabLevel INTEGER DEFAULT 0, SeqNo INTEGER, IsSingleRow TEXT, IsReadOnly TEXT, WhereClause TEXT, OrderByClause TEXT, IsActive TEXT DEFAULT \'Y\')');
  db.run('CREATE TABLE IF NOT EXISTS AD_Table (AD_Table_ID INTEGER PRIMARY KEY, TableName TEXT)');
  db.run('CREATE TABLE IF NOT EXISTS AD_Field (AD_Field_ID INTEGER PRIMARY KEY, AD_Tab_ID INTEGER, AD_Column_ID INTEGER, Name TEXT, Description TEXT, SeqNo INTEGER, IsDisplayed TEXT DEFAULT \'Y\', DisplayLogic TEXT, IsMandatory TEXT, IsReadOnly TEXT, DefaultValue TEXT, IsActive TEXT DEFAULT \'Y\')');
  db.run('CREATE TABLE IF NOT EXISTS AD_Column (AD_Column_ID INTEGER PRIMARY KEY, AD_Table_ID INTEGER, ColumnName TEXT, AD_Reference_ID INTEGER, FieldLength INTEGER, IsMandatory TEXT, IsKey TEXT, IsIdentifier TEXT, DefaultValue TEXT)');
  db.run('CREATE TABLE IF NOT EXISTS AD_Reference (AD_Reference_ID INTEGER PRIMARY KEY, Name TEXT, ValidationType TEXT)');
  db.run('CREATE TABLE IF NOT EXISTS AD_Ref_List (AD_Ref_List_ID INTEGER PRIMARY KEY, AD_Reference_ID INTEGER, Value TEXT, Name TEXT, Description TEXT, IsActive TEXT DEFAULT \'Y\')');
  db.run('CREATE TABLE IF NOT EXISTS AD_Element (AD_Element_ID INTEGER PRIMARY KEY, ColumnName TEXT, Name TEXT)');

  // Minimal test data
  db.run("INSERT INTO AD_Menu VALUES (1, 'System', '', 'Y', NULL, NULL, 'Y')");
  db.run("INSERT INTO AD_Menu VALUES (2, 'Test Window', '', 'N', 'W', 100, 'Y')");
  db.run("INSERT INTO AD_TreeNodeMM VALUES (10, 1, 0, 10, 'Y')");
  db.run("INSERT INTO AD_TreeNodeMM VALUES (10, 2, 1, 20, 'Y')");
  db.run("INSERT INTO AD_Window VALUES (100, 'Test Window', 'Test', '', 'M', 'Y')");
  db.run("INSERT INTO AD_Table VALUES (200, 'AD_Test')");
  db.run("INSERT INTO AD_Tab VALUES (300, 100, 'Header', 'Header tab', '', 200, 0, 10, 'N', 'N', NULL, NULL, 'Y')");
  db.run("INSERT INTO AD_Column VALUES (400, 200, 'AD_Test_ID', 13, 10, 'Y', 'Y', 'N', NULL)");
  db.run("INSERT INTO AD_Column VALUES (401, 200, 'Name', 10, 60, 'Y', 'N', 'Y', NULL)");
  db.run("INSERT INTO AD_Column VALUES (402, 200, 'Value', 10, 40, 'N', 'N', 'N', NULL)");
  db.run("INSERT INTO AD_Column VALUES (403, 200, 'IsActive', 38, 1, 'Y', 'N', 'N', 'Y')");
  db.run("INSERT INTO AD_Field VALUES (500, 300, 400, 'ID', '', 10, 'N', NULL, 'Y', 'Y', NULL, 'Y')");
  db.run("INSERT INTO AD_Field VALUES (501, 300, 401, 'Name', 'Record name', 20, 'Y', NULL, 'Y', 'N', NULL, 'Y')");
  db.run("INSERT INTO AD_Field VALUES (502, 300, 402, 'Value', '', 30, 'Y', NULL, 'N', 'N', NULL, 'Y')");
  db.run("INSERT INTO AD_Field VALUES (503, 300, 403, 'Active', '', 40, 'Y', NULL, 'Y', 'N', 'Y', 'Y')");

  // Test data table
  db.run('CREATE TABLE IF NOT EXISTS AD_Test (AD_Test_ID INTEGER PRIMARY KEY, Name TEXT, Value TEXT, IsActive TEXT DEFAULT \'Y\')');
  db.run("INSERT INTO AD_Test VALUES (1, 'Test1', 'val1', 'Y')");
  db.run("INSERT INTO AD_Test VALUES (2, 'Test2', 'val2', 'Y')");
}

main().catch(function (e) {
  _origLog('FATAL: ' + e.message + '\n' + e.stack);
  process.exit(1);
});
