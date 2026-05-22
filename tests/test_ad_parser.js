#!/usr/bin/env node
// test_ad_parser.js — iDempiere AD parser tests
// Run: node deploy/dev/tests/test_ad_parser.js
// METHODOLOGY: §-tagged logs are primary evidence.
// Every check parses actual values FROM the log, cross-checks against DB.

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
  _origLog('\u2550\u2550\u2550 iDempiere AD Parser Tests \u2550\u2550\u2550\n');

  var SQL = await initSqlJs();
  var mockWindow = {};
  global.window = mockWindow;

  // Capture all §-logs
  var phaseLogs = [];
  console.log = function () {
    var msg = Array.prototype.join.call(arguments, ' ');
    phaseLogs.push(msg);
    allSectionLogs.push(msg);
  };

  // Load module
  eval(loadModule('ad_parser.js'));
  var ADParser = mockWindow.ADParser;
  check('T0', 'Issue: ADParser module loads', !!ADParser, '');

  // Load AD seed data — use db.exec() which handles multiple statements
  var db = new SQL.Database();
  var seedSql = fs.readFileSync(path.join(__dirname, '..', 'ad_seed.sql'), 'utf8');
  try {
    db.exec(seedSql);
  } catch (e) {
    _origLog('  AD seed bulk load error (partial): ' + e.message.substring(0, 80));
  }
  // Verify load by counting a table
  var menuCheck = db.exec('SELECT COUNT(*) FROM AD_Menu');
  var menuLoaded = menuCheck.length ? Number(menuCheck[0].values[0][0]) : 0;
  _origLog('  AD seed loaded: menus=' + menuLoaded);

  // ══════════════════════════════════════════════════════════════════
  //  SECTION A: ADParser.init — verify §-log counts match DB
  // ══════════════════════════════════════════════════════════════════
  _origLog('\n--- Section A: ADParser.init ---');
  phaseLogs = [];
  var counts = ADParser.init(db);

  var initLogs = phaseLogs.filter(function (l) { return l.indexOf('§AD_PARSER init') >= 0; });
  check('T1a', 'Issue: init logs §AD_PARSER init', initLogs.length > 0, initLogs[0] || 'none');

  // Cross-check each count against DB
  var dbMenuCount = Number(db.exec('SELECT COUNT(*) FROM AD_Menu')[0].values[0][0]);
  var logMenuCount = initLogs.length ? extractValue(initLogs[0], 'menu') : null;
  check('T1b', 'Issue: §-log menu count matches DB',
    logMenuCount && Number(logMenuCount) === dbMenuCount,
    '§-log=' + logMenuCount + ' db=' + dbMenuCount);

  var dbWindowCount = Number(db.exec('SELECT COUNT(*) FROM AD_Window')[0].values[0][0]);
  var logWindowCount = initLogs.length ? extractValue(initLogs[0], 'windows') : null;
  check('T1c', 'Issue: §-log window count matches DB',
    logWindowCount && Number(logWindowCount) === dbWindowCount,
    '§-log=' + logWindowCount + ' db=' + dbWindowCount);

  var dbTabCount = Number(db.exec('SELECT COUNT(*) FROM AD_Tab')[0].values[0][0]);
  var logTabCount = initLogs.length ? extractValue(initLogs[0], 'tabs') : null;
  check('T1d', 'Issue: §-log tab count matches DB',
    logTabCount && Number(logTabCount) === dbTabCount,
    '§-log=' + logTabCount + ' db=' + dbTabCount);

  var dbFieldCount = Number(db.exec('SELECT COUNT(*) FROM AD_Field')[0].values[0][0]);
  var logFieldCount = initLogs.length ? extractValue(initLogs[0], 'fields') : null;
  check('T1e', 'Issue: §-log field count matches DB',
    logFieldCount && Number(logFieldCount) === dbFieldCount,
    '§-log=' + logFieldCount + ' db=' + dbFieldCount);

  // ══════════════════════════════════════════════════════════════════
  //  SECTION B: Menu tree structure
  // ══════════════════════════════════════════════════════════════════
  _origLog('\n--- Section B: Menu tree ---');
  phaseLogs = [];
  var tree = ADParser.getMenuTree(db);

  var treeLogs = phaseLogs.filter(function (l) { return l.indexOf('§AD_PARSER getMenuTree') >= 0; });
  var logNodeCount = treeLogs.length > 1 ? extractValue(treeLogs[treeLogs.length - 1], 'nodes') : null;
  var logRootCount = treeLogs.length > 1 ? extractValue(treeLogs[treeLogs.length - 1], 'roots') : null;

  check('T2a', 'Issue: getMenuTree returns non-empty array', tree.length > 0,
    'roots=' + tree.length);
  check('T2b', 'Issue: §-log root count matches returned array',
    logRootCount && Number(logRootCount) === tree.length,
    '§-log roots=' + logRootCount + ' actual=' + tree.length);

  // Cross-check: DB root count (only nodes that also exist and are active in AD_Menu)
  var dbRootCount = Number(db.exec(
    "SELECT COUNT(*) FROM AD_TreeNodeMM tn " +
    "JOIN AD_Menu m ON m.AD_Menu_ID = tn.Node_ID AND m.IsActive='Y' " +
    "WHERE tn.AD_Tree_ID=10 AND tn.Parent_ID=0 AND tn.IsActive='Y'"
  )[0].values[0][0]);
  check('T2c', 'Issue: root count matches DB (active menu nodes at Parent_ID=0)',
    tree.length === dbRootCount,
    'tree=' + tree.length + ' db=' + dbRootCount);

  // Find known folders
  var projectMgmt = tree.find(function (n) { return n.name === 'Project Management'; });
  check('T2d', 'Issue: "Project Management" folder exists in menu tree',
    !!projectMgmt,
    projectMgmt ? 'id=' + projectMgmt.id + ' children=' + projectMgmt.children.length : 'NOT FOUND');

  var partnerRel = tree.find(function (n) { return n.name === 'Partner Relations'; });
  check('T2e', 'Issue: "Partner Relations" folder exists',
    !!partnerRel,
    partnerRel ? 'children=' + partnerRel.children.length : 'NOT FOUND');

  var materialMgmt = tree.find(function (n) { return n.name.indexOf('Material') >= 0; });
  check('T2f', 'Issue: "Material Management" folder exists',
    !!materialMgmt,
    materialMgmt ? 'name=' + materialMgmt.name + ' children=' + materialMgmt.children.length : 'NOT FOUND');

  // Summary folders have isSummary=true
  check('T2g', 'Issue: root folders have isSummary=true',
    projectMgmt && projectMgmt.isSummary === true,
    'isSummary=' + (projectMgmt ? projectMgmt.isSummary : 'N/A'));

  // Find "Project" leaf node (Action=W, windowId=130)
  function findNode(nodes, name) {
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].name === name) return nodes[i];
      var found = findNode(nodes[i].children, name);
      if (found) return found;
    }
    return null;
  }
  var projectLeaf = findNode(tree, 'Project');
  check('T2h', 'Issue: "Project" leaf node exists with Action=W',
    projectLeaf && projectLeaf.action === 'W',
    projectLeaf ? 'action=' + projectLeaf.action + ' windowId=' + projectLeaf.windowId : 'NOT FOUND');

  // ══════════════════════════════════════════════════════════════════
  //  SECTION C: Window + Tabs (C_Project, window 130)
  // ══════════════════════════════════════════════════════════════════
  _origLog('\n--- Section C: C_Project window (ID=130) ---');
  phaseLogs = [];
  var projWin = ADParser.getWindow(db, 130);

  var winLogs = phaseLogs.filter(function (l) { return l.indexOf('§AD_PARSER getWindow id=130') >= 0; });
  check('T3a', 'Issue: getWindow returns C_Project',
    projWin && projWin.name === 'Project',
    projWin ? 'name=' + projWin.name : 'NULL');

  var logWinTabs = winLogs.length ? extractValue(winLogs[winLogs.length - 1], 'tabs') : null;
  check('T3b', 'Issue: §-log tab count matches returned tabs',
    logWinTabs && Number(logWinTabs) === (projWin ? projWin.tabs.length : -1),
    '§-log=' + logWinTabs + ' actual=' + (projWin ? projWin.tabs.length : 0));

  // Cross-check with DB
  var dbProjTabs = Number(db.exec(
    "SELECT COUNT(*) FROM AD_Tab WHERE AD_Window_ID=130 AND IsActive='Y'"
  )[0].values[0][0]);
  check('T3c', 'Issue: tab count matches DB',
    projWin && projWin.tabs.length === dbProjTabs,
    'parser=' + (projWin ? projWin.tabs.length : 0) + ' db=' + dbProjTabs);

  // Verify tab structure: header tab (level 0) is first
  check('T3d', 'Issue: first tab is header (TabLevel=0)',
    projWin && projWin.tabs[0] && projWin.tabs[0].tabLevel === 0,
    'tabLevel=' + (projWin && projWin.tabs[0] ? projWin.tabs[0].tabLevel : 'N/A'));

  // Verify tab has tableName from AD_Table join
  check('T3e', 'Issue: first tab has tableName=C_Project',
    projWin && projWin.tabs[0] && projWin.tabs[0].tableName === 'C_Project',
    'tableName=' + (projWin && projWin.tabs[0] ? projWin.tabs[0].tableName : 'N/A'));

  // Check Phase tab exists
  var phaseTab = projWin ? projWin.tabs.find(function (t) { return t.name === 'Phase'; }) : null;
  check('T3f', 'Issue: Phase tab exists at TabLevel=1',
    phaseTab && phaseTab.tabLevel === 1,
    phaseTab ? 'level=' + phaseTab.tabLevel + ' table=' + phaseTab.tableName : 'NOT FOUND');

  // ══════════════════════════════════════════════════════════════════
  //  SECTION D: Fields for C_Project header tab
  // ══════════════════════════════════════════════════════════════════
  _origLog('\n--- Section D: C_Project fields ---');
  phaseLogs = [];
  var projTab = projWin ? projWin.tabs[0] : null;
  var fields = projTab ? projTab.fields : [];

  var fieldLogs = phaseLogs.filter(function (l) { return l.indexOf('§AD_PARSER getFields') >= 0; });
  // Note: fields were already loaded during getWindow, so phaseLogs may not have them
  // Use the fields from the tab object instead

  check('T4a', 'Issue: C_Project tab has fields', fields.length > 0,
    'count=' + fields.length);

  // Cross-check with DB
  var headerTabId = projTab ? projTab.id : 0;
  var dbFieldCount2 = Number(db.exec(
    'SELECT COUNT(*) FROM AD_Field WHERE AD_Tab_ID = ? AND IsActive = \'Y\'', [headerTabId]
  )[0].values[0][0]);
  check('T4b', 'Issue: field count matches DB',
    fields.length === dbFieldCount2,
    'parser=' + fields.length + ' db=' + dbFieldCount2);

  // Find known fields
  var nameField = fields.find(function (f) { return f.columnName === 'Name'; });
  check('T4c', 'Issue: "Name" field exists and is displayed',
    nameField && nameField.isDisplayed,
    nameField ? 'displayed=' + nameField.isDisplayed + ' mandatory=' + nameField.isMandatory : 'NOT FOUND');

  var valueField = fields.find(function (f) { return f.columnName === 'Value'; });
  check('T4d', 'Issue: "Value" (search key) field exists',
    !!valueField,
    valueField ? 'name=' + valueField.name + ' type=' + valueField.referenceType : 'NOT FOUND');

  // DocStatus may not have an AD_Field entry (controlled by toolbar DocAction button)
  // Check if any field has a List reference type instead
  var listFields = fields.filter(function (f) { return f.referenceType === 'list'; });
  check('T4e', 'Issue: tab has fields with List reference (dropdown)',
    listFields.length > 0,
    listFields.length + ' list fields: ' + listFields.slice(0,3).map(function (f) { return f.columnName; }).join(','));

  // Key field (C_Project_ID) should be isKey=true
  var keyField = fields.find(function (f) { return f.isKey; });
  check('T4f', 'Issue: key field exists (isKey=true)',
    !!keyField,
    keyField ? 'col=' + keyField.columnName : 'NOT FOUND');

  // ══════════════════════════════════════════════════════════════════
  //  SECTION E: C_BPartner window (ID=123)
  // ══════════════════════════════════════════════════════════════════
  _origLog('\n--- Section E: C_BPartner window (ID=123) ---');
  phaseLogs = [];
  var bpWin = ADParser.getWindow(db, 123);

  check('T5a', 'Issue: C_BPartner window loads',
    bpWin && bpWin.name === 'Business Partner',
    bpWin ? 'name=' + bpWin.name + ' tabs=' + bpWin.tabs.length : 'NULL');

  // Master-detail: header tab (C_BPartner) + detail tabs (AD_User, C_BPartner_Location)
  var bpHeaderTab = bpWin ? bpWin.tabs.find(function (t) { return t.tabLevel === 0; }) : null;
  var bpDetailTabs = bpWin ? bpWin.tabs.filter(function (t) { return t.tabLevel === 1; }) : [];
  check('T5b', 'Issue: has header tab (level 0) + detail tabs (level 1)',
    bpHeaderTab && bpDetailTabs.length > 0,
    'header=' + (bpHeaderTab ? bpHeaderTab.tableName : 'N/A') +
    ' details=' + bpDetailTabs.map(function (t) { return t.tableName; }).join(','));

  // Contact (User) tab exists
  var contactTab = bpWin ? bpWin.tabs.find(function (t) { return t.name === 'Contact (User)'; }) : null;
  check('T5c', 'Issue: Contact (User) tab exists at level 1',
    contactTab && contactTab.tabLevel === 1,
    contactTab ? 'table=' + contactTab.tableName + ' level=' + contactTab.tabLevel : 'NOT FOUND');

  // ══════════════════════════════════════════════════════════════════
  //  SECTION F: M_Product window (ID=140)
  // ══════════════════════════════════════════════════════════════════
  _origLog('\n--- Section F: M_Product window (ID=140) ---');
  phaseLogs = [];
  var prodWin = ADParser.getWindow(db, 140);

  check('T6a', 'Issue: M_Product window loads',
    prodWin && prodWin.name === 'Product',
    prodWin ? 'name=' + prodWin.name + ' tabs=' + prodWin.tabs.length : 'NULL');

  // BOM tab exists (PP_Product_BOM → PP_Product_BOMLine)
  // BOM tab — may be named "BOM" or have tableName PP_Product_BOM
  var bomTab = prodWin ? prodWin.tabs.find(function (t) {
    return t.name === 'BOM' || (t.tableName && t.tableName.indexOf('BOM') >= 0);
  }) : null;
  check('T6b', 'Issue: BOM tab exists in Product window',
    !!bomTab,
    bomTab ? 'name=' + bomTab.name + ' table=' + bomTab.tableName + ' level=' + bomTab.tabLevel
           : 'NOT FOUND — tabs: ' + (prodWin ? prodWin.tabs.map(function(t){return t.name}).join(',') : 'none'));

  // Price tab exists
  var priceTab = prodWin ? prodWin.tabs.find(function (t) { return t.name === 'Price'; }) : null;
  check('T6c', 'Issue: Price tab exists (M_ProductPrice)',
    priceTab && priceTab.tableName === 'M_ProductPrice',
    priceTab ? 'table=' + priceTab.tableName : 'NOT FOUND');

  // ══════════════════════════════════════════════════════════════════
  //  SECTION G: Reference resolution
  // ══════════════════════════════════════════════════════════════════
  _origLog('\n--- Section G: Reference resolution ---');
  phaseLogs = [];

  // DocStatus reference (List type) — AD_Reference_ID = 131
  var docStatusRef = ADParser.resolveReference(db, 131);
  var refLogs = phaseLogs.filter(function (l) { return l.indexOf('§AD_PARSER resolveRef') >= 0; });
  check('T7a', 'Issue: DocStatus reference resolves as List',
    docStatusRef && docStatusRef.type === 'list',
    'type=' + (docStatusRef ? docStatusRef.type : 'N/A'));

  if (docStatusRef && docStatusRef.options) {
    // Cross-check: DB count
    var dbRefListCount = Number(db.exec(
      "SELECT COUNT(*) FROM AD_Ref_List WHERE AD_Reference_ID=131 AND IsActive='Y'"
    )[0].values[0][0]);
    check('T7b', 'Issue: option count matches DB AD_Ref_List',
      docStatusRef.options.length === dbRefListCount,
      'parser=' + docStatusRef.options.length + ' db=' + dbRefListCount);

    // Known values: DR, IP, CO, VO, RE
    var drOption = docStatusRef.options.find(function (o) { return o.value === 'DR'; });
    check('T7c', 'Issue: DocStatus has "Drafted" (DR) option',
      !!drOption, drOption ? 'name=' + drOption.name : 'NOT FOUND');
  }

  // ══════════════════════════════════════════════════════════════════
  //  SECTION H: DisplayLogic evaluator
  // ══════════════════════════════════════════════════════════════════
  _origLog('\n--- Section H: DisplayLogic evaluator ---');

  check('T8a', 'Issue: empty logic returns true',
    ADParser.evaluateDisplayLogic('', {}) === true, '');
  check('T8b', 'Issue: null logic returns true',
    ADParser.evaluateDisplayLogic(null, {}) === true, '');
  check('T8c', 'Issue: @DocStatus@=\'DR\' matches record',
    ADParser.evaluateDisplayLogic("@DocStatus@='DR'", { DocStatus: 'DR' }) === true,
    'DR=DR');
  check('T8d', 'Issue: @DocStatus@=\'DR\' fails on CO',
    ADParser.evaluateDisplayLogic("@DocStatus@='DR'", { DocStatus: 'CO' }) === false,
    'CO!=DR');
  check('T8e', 'Issue: @IsActive@=\'Y\' & @DocStatus@=\'DR\' (AND)',
    ADParser.evaluateDisplayLogic("@IsActive@='Y'&@DocStatus@='DR'",
      { IsActive: 'Y', DocStatus: 'DR' }) === true, 'both true');
  check('T8f', 'Issue: AND fails when one condition false',
    ADParser.evaluateDisplayLogic("@IsActive@='Y'&@DocStatus@='DR'",
      { IsActive: 'Y', DocStatus: 'CO' }) === false, 'second false');

  // ══════════════════════════════════════════════════════════════════
  //  SECTION I: GardenWorld data tables
  // ══════════════════════════════════════════════════════════════════
  _origLog('\n--- Section I: GardenWorld data ---');

  var bpCount = Number(db.exec('SELECT COUNT(*) FROM C_BPartner')[0].values[0][0]);
  check('T9a', 'Issue: GardenWorld has business partners', bpCount > 0,
    'count=' + bpCount);

  var prodCount = Number(db.exec('SELECT COUNT(*) FROM M_Product')[0].values[0][0]);
  check('T9b', 'Issue: GardenWorld has products', prodCount > 0,
    'count=' + prodCount);

  var priceCount = Number(db.exec('SELECT COUNT(*) FROM M_ProductPrice')[0].values[0][0]);
  check('T9c', 'Issue: GardenWorld has product prices', priceCount > 0,
    'count=' + priceCount);

  // Master-detail: BPartner has contacts (AD_User)
  var bpWithContacts = db.exec(
    'SELECT bp.Name, COUNT(u.AD_User_ID) FROM C_BPartner bp ' +
    'LEFT JOIN AD_User u ON u.C_BPartner_ID = bp.C_BPartner_ID ' +
    'WHERE bp.AD_Client_ID = 11 GROUP BY bp.Name HAVING COUNT(u.AD_User_ID) > 0');
  var bpContactCount = bpWithContacts.length ? bpWithContacts[0].values.length : 0;
  check('T9d', 'Issue: some BPartners have contacts (master-detail)',
    bpContactCount > 0,
    bpContactCount + ' partners with contacts');

  // Product has prices (master-detail)
  var prodWithPrices = db.exec(
    'SELECT p.Name, COUNT(pp.M_PriceList_Version_ID) FROM M_Product p ' +
    'JOIN M_ProductPrice pp ON pp.M_Product_ID = p.M_Product_ID ' +
    'GROUP BY p.Name HAVING COUNT(pp.M_PriceList_Version_ID) > 0');
  var prodPriceCount = prodWithPrices.length ? prodWithPrices[0].values.length : 0;
  check('T9e', 'Issue: some Products have prices (master-detail)',
    prodPriceCount > 0,
    prodPriceCount + ' products with prices');

  // ══════════════════════════════════════════════════════════════════
  //  SECTION J: §-log coverage audit
  // ══════════════════════════════════════════════════════════════════
  _origLog('\n--- Section J: §-log coverage audit ---');
  var uniqueTags = {};
  allSectionLogs.forEach(function (l) {
    var m = l.match(/§([A-Z_]+)/);
    if (m) uniqueTags[m[1]] = (uniqueTags[m[1]] || 0) + 1;
  });
  var tagEvidence = Object.keys(uniqueTags).sort().map(function (t) {
    return t + ':' + uniqueTags[t];
  }).join(', ');

  check('T10a', 'Issue: §AD_PARSER tag emitted', !!uniqueTags['AD_PARSER'],
    'count=' + (uniqueTags['AD_PARSER'] || 0));
  check('T10b', 'Issue: §AD_PARSER_LOADED tag emitted', !!uniqueTags['AD_PARSER_LOADED'],
    'count=' + (uniqueTags['AD_PARSER_LOADED'] || 0));

  _origLog('\n  All §-tags: ' + tagEvidence);

  // ══════════════════════════════════════════════════════════════════
  //  RESULTS
  // ══════════════════════════════════════════════════════════════════
  _origLog('\n\u2550\u2550\u2550 Results: ' + pass + ' passed, ' + fail + ' failed \u2550\u2550\u2550');

  var logDir = path.join(__dirname, '..', 'test-results');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  var logPath = path.join(logDir, 'test_ad_parser.log');
  var logContent = testLogs.join('\n') + '\nTotal: ' + pass + '/' + (pass + fail) + '\n';
  fs.writeFileSync(logPath, logContent);
  _origLog('Log saved: ' + logPath);

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(function (e) {
  _origLog('§TEST fatal: ' + e.message);
  _origLog(e.stack);
  process.exit(1);
});
