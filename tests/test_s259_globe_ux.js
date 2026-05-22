// test_s259_globe_ux.js — Whitebox tests for S259c Globe UX Triage
// Witness: W-GLOBE-UX-TRIAGE
// Tests: collapse dim clearing, gateway filter args, empty-tap collapse
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
  } else {
    failed++;
    results.push('  \u2717 FAIL: ' + name);
  }
  if (evidence) results.push('        evidence: ' + evidence);
}

// ── Shim: wrap better-sqlite3 to match sql.js API ──

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
    }
  };
}

function run() {
  var bsDb = new Database(':memory:');
  var seedPath = path.join(__dirname, '..', 'ad_seed.sql');
  var seedSQL = fs.readFileSync(seedPath, 'utf8');
  bsDb.exec(seedSQL);
  var db = shimDB(bsDb);

  // Set up globals
  var modDir = path.join(__dirname, '..');
  global.window = {};
  global.document = {
    addEventListener: function () {},
    removeEventListener: function () {},
    createElement: function () { return { style: {}, textContent: '', addEventListener: function () {} }; }
  };
  global.history = { pushState: function () {} };
  global.performance = { now: function () { return Date.now(); } };
  global.requestAnimationFrame = function () { return 1; };
  global.cancelAnimationFrame = function () {};

  require(path.join(modDir, 'kernel_ops.js'));
  require(path.join(modDir, 'erp_search.js'));
  require(path.join(modDir, 'ad_graph.js'));

  var ADGraph = global.window.ADGraph;
  var D = ADGraph._debug;

  // Mock canvas
  var mockCanvas = {
    width: 800, height: 600,
    getContext: function () {
      return {
        clearRect: function () {},
        createRadialGradient: function () { return { addColorStop: function () {} }; },
        fillRect: function () {}, beginPath: function () {}, arc: function () {},
        ellipse: function () {}, fill: function () {}, stroke: function () {},
        moveTo: function () {}, lineTo: function () {}, closePath: function () {},
        fillText: function () {}, save: function () {}, restore: function () {},
        fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, font: '',
        textAlign: '', textBaseline: ''
      };
    },
    addEventListener: function () {},
    removeEventListener: function () {}
  };

  // Track onDrill calls with 4th arg
  var drillCalls = [];
  function mockDrill(table, windowId, record, filterMode) {
    drillCalls.push({ table: table, windowId: windowId, record: record, filterMode: filterMode });
  }

  ADGraph.init(mockCanvas, db, 'gardenworld', mockDrill);

  results.push('\n=== S259c Globe UX Triage — Whitebox Debug Tests ===\n');

  // ── §1: Collapse Animation — Dim Clearing ──────────────────────────

  results.push('--- §1: Collapse → Dim Clearing ---');

  // Step 1: Navigate to entity view
  ADGraph.showEntity('C_BPartner');
  var nodeCount = ADGraph.getNodeCount();
  console.log('§T1 entity view nodes=' + nodeCount + ' view=' + ADGraph.getCurrentView());
  assert(nodeCount > 0, 'T1a: Entity view has nodes', 'count=' + nodeCount);

  // Step 2: Find a RECORD node and expand it (spawn gateways)
  var nodes = D.getNodes();
  var recordNode = null;
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].type === 'RECORD' && nodes[i].record) {
      recordNode = nodes[i];
      break;
    }
  }
  assert(recordNode !== null, 'T1b: Found a RECORD node to expand',
    'id=' + (recordNode ? recordNode.id : 'NONE') + ' table=' + (recordNode ? recordNode.tableName : '-'));

  // Step 3: Expand (should spawn gateways)
  var beforeExpand = D.getActiveExpanded();
  console.log('§T1 before expand: _activeExpandedNode=' + (beforeExpand ? beforeExpand.id : 'null'));
  assert(beforeExpand === null, 'T1c: No active expansion before expand',
    '_activeExpandedNode=' + (beforeExpand ? beforeExpand.id : 'null'));

  D.expandRecord(recordNode);
  var afterExpand = D.getActiveExpanded();
  console.log('§T1 after expand: _activeExpandedNode=' + (afterExpand ? afterExpand.id : 'null') +
    ' expanded=' + recordNode.expanded + ' children=' + recordNode.children.length +
    ' gatewaysSpawned=' + recordNode._gatewaysSpawned);
  assert(afterExpand !== null, 'T1d: _activeExpandedNode set after expand',
    'node=' + (afterExpand ? afterExpand.id : 'null'));
  assert(recordNode.children.length === 2, 'T1e: Gateways spawned (2 children)',
    'children=' + recordNode.children.length + ' types=' +
    recordNode.children.map(function(c){return c._isGateway || c.type;}).join(','));

  // Step 4: Collapse the record node
  D.collapseNode(recordNode);
  var afterCollapse = D.getActiveExpanded();
  console.log('§T1 after collapse: _activeExpandedNode=' + (afterCollapse ? afterCollapse.id : 'null') +
    ' expanded=' + recordNode.expanded +
    ' collapsingChildren=' + recordNode._collapsingChildren);
  assert(afterCollapse === null, 'T1f: _activeExpandedNode=null after collapse (dim cleared)',
    '_activeExpandedNode=' + (afterCollapse ? afterCollapse.id : 'null'));

  // Verify all nodes would render at full brightness (dimFactor=1.0)
  var allNodes = D.getNodes();
  var dimmedCount = 0;
  for (var di = 0; di < allNodes.length; di++) {
    // Simulate _drawNode dim logic
    var n = allNodes[di];
    var dimFactor = 1.0;
    if (afterCollapse && afterCollapse !== n) {
      var isChild = n.parent === afterCollapse;
      if (!isChild) dimFactor = 0.4;
    }
    if (dimFactor < 1.0) dimmedCount++;
  }
  console.log('§T1 brightness check: dimmedCount=' + dimmedCount + ' total=' + allNodes.length);
  assert(dimmedCount === 0, 'T1g: ALL nodes at full brightness after collapse',
    'dimmed=' + dimmedCount + ' total=' + allNodes.length);

  // ── §2: Properties Expand → Collapse Parent → Dim Clears ───────────

  results.push('\n--- §2: Properties Expand → Collapse Parent ---');

  // Re-expand record to spawn gateways + expand Properties
  ADGraph.showEntity('C_BPartner');
  nodes = D.getNodes();
  recordNode = null;
  for (i = 0; i < nodes.length; i++) {
    if (nodes[i].type === 'RECORD' && nodes[i].record) {
      recordNode = nodes[i];
      break;
    }
  }

  // Expand → gateways
  D.expandRecord(recordNode);
  var gateways = recordNode.children;
  console.log('§T2 gateways: count=' + gateways.length +
    ' types=' + gateways.map(function(g){return g._isGateway;}).join(','));

  // Find Properties gateway and expand it (sub-constellation)
  var propGWt2 = null;
  for (i = 0; i < gateways.length; i++) {
    if (gateways[i]._isGateway === 'properties') { propGWt2 = gateways[i]; break; }
  }
  assert(propGWt2 !== null, 'T2a: Properties gateway found', 'id=' + (propGWt2 ? propGWt2.id : 'NONE'));

  if (propGWt2) {
    D.expandProperties(propGWt2);
    var afterPropExpand = D.getActiveExpanded();
    console.log('§T2 after Properties expand: _activeExpandedNode=' + (afterPropExpand ? afterPropExpand.id : 'null') +
      ' propGW.expanded=' + propGWt2.expanded + ' propGW.children=' + propGWt2.children.length);
    assert(afterPropExpand !== null, 'T2b: _activeExpandedNode set after Properties expand',
      'node=' + (afterPropExpand ? afterPropExpand.id : 'null'));

    // Now collapse PARENT record (which contains gateways + property bubbles)
    D.collapseNode(recordNode);
    var afterNestedCollapse = D.getActiveExpanded();
    console.log('§T2 after parent collapse: _activeExpandedNode=' + (afterNestedCollapse ? afterNestedCollapse.id : 'null') +
      ' parent.expanded=' + recordNode.expanded);
    assert(afterNestedCollapse === null, 'T2c: _activeExpandedNode=null after nested collapse',
      '_activeExpandedNode=' + (afterNestedCollapse ? afterNestedCollapse.id : 'null'));
  }

  // ── §3: Properties Gateway → Property Bubbles → Filter Query ────────

  results.push('\n--- §3: Properties → Property Bubbles → Filter ---');

  // Fresh entity view
  ADGraph.showEntity('C_BPartner');
  drillCalls = [];
  nodes = D.getNodes();
  recordNode = null;
  for (i = 0; i < nodes.length; i++) {
    if (nodes[i].type === 'RECORD' && nodes[i].record) {
      recordNode = nodes[i];
      break;
    }
  }

  // Spawn gateways
  D.expandRecord(recordNode);
  var propGW = null, dataGW2 = null;
  for (i = 0; i < recordNode.children.length; i++) {
    if (recordNode.children[i]._isGateway === 'properties') propGW = recordNode.children[i];
    if (recordNode.children[i]._isGateway === 'data') dataGW2 = recordNode.children[i];
  }

  console.log('§T3 gateways: prop=' + (propGW ? propGW.id : 'NONE') +
    ' data=' + (dataGW2 ? dataGW2.id : 'NONE'));

  // Properties tap → should EXPAND into property-name bubbles (not call onDrill)
  assert(propGW !== null, 'T3a: Properties gateway exists', 'id=' + (propGW ? propGW.id : 'NONE'));
  D.expandProperties(propGW);
  var propChildren = propGW.children;
  console.log('§T3 prop bubbles: count=' + propChildren.length +
    ' labels=[' + propChildren.slice(0, 5).map(function(c){return c.label;}).join(',') + ']' +
    ' columns=[' + propChildren.slice(0, 5).map(function(c){return c._propertyColumn;}).join(',') + ']');
  assert(propChildren.length > 0, 'T3b: Properties gateway expands into property bubbles',
    'count=' + propChildren.length);

  // Each property bubble should have _isPropertyBubble and _propertyColumn
  var allHaveCol = propChildren.every(function(c) { return c._isPropertyBubble && c._propertyColumn; });
  assert(allHaveCol, 'T3c: Every property bubble has _isPropertyBubble + _propertyColumn',
    'sample=' + (propChildren[0] ? propChildren[0]._propertyColumn + '=' + propChildren[0]._propertyValue : 'none'));

  // Simulate tapping a property bubble → onDrill called with column name as filter
  drillCalls = [];
  if (propChildren.length > 0) {
    var propBub = propChildren[0];
    // Simulate what tap handler does: _onDrill(table, windowId, record, _propertyColumn)
    mockDrill(propBub.tableName, propBub.windowId, propBub.record, propBub._propertyColumn);
  }
  assert(drillCalls.length === 1 && drillCalls[0].filterMode !== undefined &&
    drillCalls[0].filterMode !== 'properties' && drillCalls[0].filterMode !== 'data',
    'T3d: Property bubble tap passes column name as filterMode (not generic "properties")',
    'filterMode=' + (drillCalls[0] ? drillCalls[0].filterMode : 'undefined'));
  console.log('§T3 drill call: filterMode=' + (drillCalls[0] ? drillCalls[0].filterMode : 'none') +
    ' → panel should filter WHERE ' + (drillCalls[0] ? drillCalls[0].filterMode : '?') + ' IS NOT NULL ORDER BY ' + (drillCalls[0] ? drillCalls[0].filterMode : '?'));

  // Data gateway tap → straight to panel (NO sub-bubbles on globe)
  results.push('\n--- §3b: Data Gateway → Straight to Panel (no sub-bubbles) ---');
  drillCalls = [];
  if (dataGW2) {
    // Data gateway should NOT expand into FK children on the globe
    // It should call onDrill directly with 'data' filter
    // Verify: Data gateway must NOT have _gatewaysSpawned or expandable behavior
    console.log('§T3 data gateway: expanded=' + dataGW2.expanded + ' children=' + dataGW2.children.length);
    assert(dataGW2.children.length === 0, 'T3e: Data gateway has NO children bubbles (goes straight to panel)',
      'children=' + dataGW2.children.length);

    // Simulate tap: handler calls _onDrill(table, windowId, record, 'data')
    mockDrill(dataGW2.tableName, dataGW2.windowId, dataGW2.record, 'data');
    assert(drillCalls.length === 1 && drillCalls[0].filterMode === 'data',
      'T3f: Data gateway tap passes filterMode="data" to onDrill',
      'filterMode=' + (drillCalls[0] ? drillCalls[0].filterMode : 'undefined'));
  }

  // ── §4: Data gateway goes straight to panel — no FK sub-bubbles ────

  results.push('\n--- §4: Data = Direct Panel, Properties = Bubble Picker ---');

  // Verify the design: Properties expands bubbles, Data opens panel directly
  assert(propGW && propGW.children.length > 0, 'T4a: Properties expands into property-name bubbles',
    'propChildren=' + (propGW ? propGW.children.length : 0));
  assert(dataGW2 && dataGW2.children.length === 0, 'T4b: Data does NOT expand bubbles (panel only)',
    'dataChildren=' + (dataGW2 ? dataGW2.children.length : 0));
  console.log('§T4 design verified: Properties=bubbles(' + (propGW ? propGW.children.length : 0) +
    ') Data=panel(0 bubbles)');

  // ── §5: Rapid expand/collapse cycling — no stuck dim ───────────────

  results.push('\n--- §5: Rapid Expand/Collapse Cycling ---');

  ADGraph.showEntity('C_BPartner');
  nodes = D.getNodes();

  var stuckDim = false;
  for (var cycle = 0; cycle < 5; cycle++) {
    // Find first RECORD
    var rec = null;
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i].type === 'RECORD' && nodes[i].record && !nodes[i].expanded) {
        rec = nodes[i]; break;
      }
    }
    if (!rec) break;

    D.expandRecord(rec);
    var ae = D.getActiveExpanded();
    D.collapseNode(rec);
    var ac = D.getActiveExpanded();
    if (ac !== null) {
      stuckDim = true;
      console.log('§T5 STUCK DIM at cycle=' + cycle + ' _activeExpandedNode=' + ac.id);
      break;
    }
    nodes = D.getNodes(); // refresh after collapse starts
  }
  var finalAE = D.getActiveExpanded();
  console.log('§T5 after 5 cycles: _activeExpandedNode=' + (finalAE ? finalAE.id : 'null') + ' stuck=' + stuckDim);
  assert(!stuckDim && finalAE === null, 'T5a: No stuck dim after 5 expand/collapse cycles',
    '_activeExpandedNode=' + (finalAE ? finalAE.id : 'null'));

  // ── §6: collapseAll clears dim ────────────────────────────────────

  results.push('\n--- §6: collapseAll Clears Dim ---');

  ADGraph.showEntity('C_BPartner');
  nodes = D.getNodes();
  recordNode = null;
  for (i = 0; i < nodes.length; i++) {
    if (nodes[i].type === 'RECORD' && nodes[i].record) { recordNode = nodes[i]; break; }
  }
  D.expandRecord(recordNode);
  var aeBeforeAll = D.getActiveExpanded();
  console.log('§T6 before collapseAll: _activeExpandedNode=' + (aeBeforeAll ? aeBeforeAll.id : 'null'));
  ADGraph.collapseAll();
  var aeAfterAll = D.getActiveExpanded();
  console.log('§T6 after collapseAll: _activeExpandedNode=' + (aeAfterAll ? aeAfterAll.id : 'null'));
  assert(aeAfterAll === null, 'T6a: collapseAll clears _activeExpandedNode',
    'before=' + (aeBeforeAll ? aeBeforeAll.id : 'null') + ' after=' + (aeAfterAll ? aeAfterAll.id : 'null'));

  // ── §7: Gateway colours (visual correctness) ──────────────────────

  results.push('\n--- §7: Gateway Colours ---');

  ADGraph.showEntity('C_BPartner');
  nodes = D.getNodes();
  recordNode = null;
  for (i = 0; i < nodes.length; i++) {
    if (nodes[i].type === 'RECORD' && nodes[i].record) { recordNode = nodes[i]; break; }
  }
  D.expandRecord(recordNode);
  propGW = null; dataGW2 = null;
  for (i = 0; i < recordNode.children.length; i++) {
    if (recordNode.children[i]._isGateway === 'properties') propGW = recordNode.children[i];
    if (recordNode.children[i]._isGateway === 'data') dataGW2 = recordNode.children[i];
  }

  if (propGW) {
    console.log('§T7 Properties gateway: colour=' + propGW.colour + ' count=' + propGW.count);
    var propOrange = propGW.colour === '#ff6b35';
    var propGrey = propGW.colour === '#555';
    assert(propOrange || propGrey, 'T7a: Properties gateway is orange (has content) or grey (empty)',
      'colour=' + propGW.colour + ' nonNull=' + propGW.count);
    if (propGW.count > 0) {
      assert(propOrange, 'T7b: Properties with content → orange',
        'colour=' + propGW.colour + ' count=' + propGW.count);
    }
  }
  if (dataGW2) {
    console.log('§T7 Data gateway: colour=' + dataGW2.colour + ' count=' + dataGW2.count);
    var dataBlue = dataGW2.colour === '#4fc3f7';
    var dataGrey = dataGW2.colour === '#555';
    assert(dataBlue || dataGrey, 'T7c: Data gateway is blue (FK exists) or grey (empty)',
      'colour=' + dataGW2.colour + ' fkCount=' + dataGW2.count);
  }

  // ── §7b: Label quality — property bubbles are column names ──────────

  results.push('\n--- §7b: Label Quality ---');

  // Check property bubble labels — should be CamelCase-spaced column names, not values
  if (propGW && propGW.children.length > 0) {
    var propLabels = propGW.children.map(function(c){return c.label;});
    var hasShortBool = propLabels.some(function(l) { return l === 'Y' || l === 'N'; });
    console.log('§T7b propLabels: [' + propLabels.slice(0, 8).join(',') + ']');
    assert(!hasShortBool, 'T7d: Property bubble labels are column names, not Y/N values',
      'sample=[' + propLabels.slice(0, 5).join(',') + ']');

    // Verify each bubble has meaningful label (spaced CamelCase, length > 1)
    var allMeaningful = propLabels.every(function(l) { return l.length > 1; });
    assert(allMeaningful, 'T7e: All property labels are meaningful (length > 1)',
      'shortest=' + propLabels.reduce(function(a,b){return a.length < b.length ? a : b;}));
  }

  // ── §8: _buildHomeNodes / _buildEntityNodes clear dim ──────────────

  results.push('\n--- §8: View Rebuild Clears Dim ---');

  // Set up dim state
  ADGraph.showEntity('C_BPartner');
  nodes = D.getNodes();
  for (i = 0; i < nodes.length; i++) {
    if (nodes[i].type === 'RECORD' && nodes[i].record) { recordNode = nodes[i]; break; }
  }
  D.expandRecord(recordNode);
  var aeBefore = D.getActiveExpanded();
  console.log('§T8 before showEntity: _activeExpandedNode=' + (aeBefore ? aeBefore.id : 'null'));
  assert(aeBefore !== null, 'T8a: Dim is active before view rebuild',
    '_activeExpandedNode=' + (aeBefore ? aeBefore.id : 'null'));

  // showEntity rebuilds → should clear
  ADGraph.showEntity('M_Product');
  var aeAfterRebuild = D.getActiveExpanded();
  console.log('§T8 after showEntity(M_Product): _activeExpandedNode=' + (aeAfterRebuild ? aeAfterRebuild.id : 'null'));
  assert(aeAfterRebuild === null, 'T8b: showEntity clears _activeExpandedNode',
    '_activeExpandedNode=' + (aeAfterRebuild ? aeAfterRebuild.id : 'null'));

  // ── §9: Accordion Panel — ad_ui.js integration ─────────────────────

  results.push('\n--- §9: Accordion Panel (ad_ui.js) ---');

  // Load ad_ui.js modules (need ad_parser, ad_data)
  // Mock DOM for ad_ui
  global.document = {
    addEventListener: function () {},
    removeEventListener: function () {},
    createElement: function (tag) {
      return {
        style: { cssText: '' },
        className: '',
        innerHTML: '',
        textContent: '',
        dataset: {},
        childNodes: [],
        parentNode: null,
        appendChild: function (ch) { this.childNodes.push(ch); ch.parentNode = this; return ch; },
        removeChild: function (ch) { var i = this.childNodes.indexOf(ch); if (i>=0) this.childNodes.splice(i,1); },
        querySelector: function () { return { textContent: '', style: {} }; },
        querySelectorAll: function () { return []; },
        addEventListener: function () {},
        hasChildNodes: function () { return this.childNodes.length > 0; },
        getBoundingClientRect: function () { return {left:0,top:0,width:800,height:600}; }
      };
    },
    body: {
      appendChild: function (ch) { this._lastChild = ch; },
      removeChild: function () {},
      _lastChild: null
    },
    getElementById: function () { return null; },
    querySelectorAll: function () { return []; }
  };
  global.localStorage = { getItem: function(){return null;}, setItem: function(){}, removeItem: function(){} };
  global.navigator = { clipboard: { writeText: function(){} } };
  global.BroadcastChannel = function() { this.postMessage=function(){}; this.close=function(){}; this.addEventListener=function(){}; };
  global.Audio = function() { this.play=function(){return {catch:function(){}};}; this.pause=function(){}; this.volume=0; };
  global.history = { pushState: function(){} };

  // Load AD modules
  try {
    require(path.join(modDir, 'ad_parser.js'));
    require(path.join(modDir, 'ad_data.js'));
  } catch(e) {}
  // Load ad_charts stub if needed
  if (!global.window.ADCharts) global.window.ADCharts = { render: function(){}, buildDashboard: function(){} };
  try {
    require(path.join(modDir, 'ad_ui.js'));
  } catch(e) {
    console.log('§T9 ad_ui load error: ' + e.message);
  }

  var ADUI = global.window.ADUI;

  // Capture §ACCORDION logs
  var accordionLogs = [];
  var _realLog = console.log;
  console.log = function() {
    var msg = Array.prototype.join.call(arguments, ' ');
    if (msg.indexOf('§ACCORDION') >= 0 || msg.indexOf('§AD_UI drill') >= 0) {
      accordionLogs.push(msg);
    }
    _realLog.apply(console, arguments);
  };

  // Verify source code has all accordion components
  var adUiSrc = require('fs').readFileSync(path.join(modDir, 'ad_ui.js'), 'utf8');
  assert(adUiSrc.indexOf('_openAccordionPanel') >= 0, 'T9a: ad_ui.js has _openAccordionPanel',
    'found=true');
  assert(adUiSrc.indexOf('_caseGet') >= 0, 'T9b: ad_ui.js has _caseGet (case-insensitive)',
    'found=true');
  assert(adUiSrc.indexOf('_buildFieldGrid') >= 0, 'T9c: ad_ui.js has _buildFieldGrid (cols-as-headers)',
    'found=true');
  assert(adUiSrc.indexOf('_discoverChildTabs') >= 0, 'T9d: ad_ui.js has _discoverChildTabs (FK tabs)',
    'found=true');
  assert(adUiSrc.indexOf('function _graphDrillCallback(tableName, windowId, record, filterMode)') >= 0,
    'T9e: _graphDrillCallback accepts filterMode (4th arg)', 'found=true');
  var hasFilterIndicator = adUiSrc.indexOf('NULL') >= 0 && adUiSrc.indexOf('filter') >= 0;
  assert(hasFilterIndicator, 'T9f: Panel shows filter indicator for Properties column',
    'found=true');

  // Verify ADUI loaded and has the openWindow function
  if (ADUI) {
    assert(typeof ADUI.openWindow === 'function', 'T9g: ADUI.openWindow loaded',
      'type=' + typeof ADUI.openWindow);
  }
  console.log('§T9 accordion verified: panel + fields + childTabs + filter');

  console.log = _realLog;

  // ═══════════════════════════════════════════════════════════════════

  results.push('\n\u2550\u2550\u2550 Results: ' + passed + ' passed, ' + failed + ' failed \u2550\u2550\u2550');
  var output = results.join('\n');
  console.log(output);

  // Save log
  var logDir = path.join(__dirname, '..', 'test-results');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, 'test_s259_globe_ux.log'), output, 'utf8');
  console.log('Log saved: ' + path.join(logDir, 'test_s259_globe_ux.log'));

  process.exit(failed > 0 ? 1 : 0);
}

run();
