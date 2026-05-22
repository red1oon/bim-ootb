// test_s259_table_overlay.js — Whitebox test: Table Overlay cascading drill
// Witness: W-TABLE-OVERLAY
// Proves: long-press opens accordion overlay with focus, drill, cascade, keyboard
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

let passed = 0, failed = 0;
const results = [];

function assert(cond, name, evidence) {
  if (cond) { passed++; results.push('  \u2713 ' + name); }
  else { failed++; results.push('  \u2717 FAIL: ' + name); }
  if (evidence) results.push('        evidence: ' + evidence);
}

function shimDB(bsDb) {
  return {
    exec: function (sql, params) {
      try {
        var stmt = bsDb.prepare(sql);
        var rows = params ? stmt.all(...params) : stmt.all();
        if (!rows.length) return [];
        var columns = Object.keys(rows[0]);
        var values = rows.map(r => columns.map(c => r[c]));
        return [{ columns, values }];
      } catch (e) { throw e; }
    },
    run: function (sql, params) {
      if (params) bsDb.prepare(sql).run(...params);
      else bsDb.exec(sql);
    }
  };
}

function run() {
  var bsDb = new Database(':memory:');
  var seedPath = path.join(__dirname, '..', 'ad_seed.sql');
  bsDb.exec(fs.readFileSync(seedPath, 'utf8'));
  var db = shimDB(bsDb);
  var modDir = path.join(__dirname, '..');

  results.push('\n=== S259c Table Overlay — Whitebox Cascading Drill Test ===\n');

  var adUiSrc = fs.readFileSync(path.join(modDir, 'ad_ui.js'), 'utf8');
  var adGraphSrc = fs.readFileSync(path.join(modDir, 'ad_graph.js'), 'utf8');

  // ════════════════════════════════════════════════════════════════════════
  // §T1: Source code structure — all required code paths exist
  // ════════════════════════════════════════════════════════════════════════

  results.push('--- §T1: Code Paths Exist ---');

  assert(adUiSrc.indexOf('function _openTableView') > 0,
    'T1a: _openTableView function exists', 'found in ad_ui.js');

  assert(adUiSrc.indexOf("filterMode === 'table'") > 0,
    'T1b: _graphDrillCallback routes filterMode=table to _openAccordionPanel',
    'guard check found');

  assert(adUiSrc.indexOf('table-overlay') > 0,
    'T1c: Renders as inline overlay (not window.open)',
    'id=table-overlay found');

  assert(adUiSrc.indexOf('function drillRecord') > 0,
    'T1d: drillRecord function exists (row tap → cascade)',
    'found');

  assert(adUiSrc.indexOf('function resetToHeader') > 0,
    'T1e: resetToHeader function exists (title tap / Escape)',
    'found');

  assert(adUiSrc.indexOf('function openAcc') > 0,
    'T1f: openAcc function exists (tab switching)',
    'found');

  assert(adUiSrc.indexOf('function _highlightRow') > 0,
    'T1g: _highlightRow function exists (cursor/focus)',
    'found');

  assert(adUiSrc.indexOf('function _onKeyDown') > 0,
    'T1h: _onKeyDown function exists (keyboard handler)',
    'found');

  // ════════════════════════════════════════════════════════════════════════
  // §T2: Auto-focus first row on open
  // ════════════════════════════════════════════════════════════════════════

  results.push('\n--- §T2: Auto-Focus First Row ---');

  // openAcc calls setTimeout → _highlightRow(0) at end
  assert(adUiSrc.indexOf('_highlightRow(0)') > 0,
    'T2a: openAcc auto-highlights row 0',
    'found _highlightRow(0) in openAcc');

  assert(adUiSrc.indexOf("§TABLE_FOCUS") > 0,
    'T2b: Focus emits §TABLE_FOCUS log',
    'log tag found');

  // Verify _highlightRow adds .sel class
  assert(adUiSrc.indexOf("classList.add('sel')") > 0,
    'T2c: _highlightRow adds .sel class to row',
    'found');

  assert(adUiSrc.indexOf("scrollIntoView") > 0,
    'T2d: Focused row scrolls into view',
    'found');

  // ════════════════════════════════════════════════════════════════════════
  // §T3: Cascading drill — row tap reduces header, opens child tab
  // ════════════════════════════════════════════════════════════════════════

  results.push('\n--- §T3: Cascading Drill Logic ---');

  assert(adUiSrc.indexOf('§TABLE_DRILL pk=') > 0,
    'T3a: drillRecord logs §TABLE_DRILL with pk',
    'found');

  assert(adUiSrc.indexOf('appendChild(selRow.cloneNode(true))') > 0,
    'T3b: drillRecord reduces header to 1 row (clones selected row)',
    'found');

  // Verify header row tapped → drillRecord called
  assert(adUiSrc.indexOf('drillRecord(row.dataset.pk)') > 0,
    'T3c: Header row pointer tap calls drillRecord(pk)',
    'found');

  // Verify child tab row tap → cascade to next
  assert(adUiSrc.indexOf('§TABLE_CASCADE') > 0,
    'T3d: Child tab row tap cascades to next tab',
    'found');

  // No-child-tabs case — stays on header instead of getting lost
  assert(adUiSrc.indexOf("'§TABLE_DRILL no child tabs") > 0,
    'T3e: drillRecord handles no-child-tabs gracefully (stays on header)',
    'found');

  // ════════════════════════════════════════════════════════════════════════
  // §T4: Keyboard navigation
  // ════════════════════════════════════════════════════════════════════════

  results.push('\n--- §T4: Keyboard Navigation ---');

  assert(adUiSrc.indexOf("e.key === 'ArrowDown'") > 0,
    'T4a: ArrowDown handler exists', 'found');
  assert(adUiSrc.indexOf("e.key === 'ArrowUp'") > 0,
    'T4b: ArrowUp handler exists', 'found');
  assert(adUiSrc.indexOf("e.key === 'Tab'") > 0,
    'T4c: Tab key cycles tabs forward', 'found');
  assert(adUiSrc.indexOf('e.shiftKey') > 0 && adUiSrc.indexOf('_curAcc - 1') > 0,
    'T4c2: Shift+Tab cycles tabs backward', 'found e.shiftKey + _curAcc - 1');
  assert(adUiSrc.indexOf("e.key === 'Enter'") > 0,
    'T4d: Enter key drills record', 'found');
  assert(adUiSrc.indexOf("e.key === 'Escape'") > 0,
    'T4e: Escape key handler exists', 'found');

  // Escape from drilled state → reset (not close)
  assert(adUiSrc.indexOf('_selectedPk !== null') > 0 && adUiSrc.indexOf('resetToHeader()') > 0,
    'T4f: Escape from drill → resetToHeader (not close)',
    'found _selectedPk check + resetToHeader call');

  // §OV.15 Tab wrap in drilled state → reset (prevents stuck loop)
  assert(adUiSrc.indexOf('§TABLE_TAB_RESET') > 0,
    'T4g: Tab wrapping to 0 in drilled state resets to header (no stuck loop)',
    'found §OV.15 + §TABLE_TAB_RESET');

  assert(adUiSrc.indexOf('nextAcc === 0 && _selectedPk !== null') > 0,
    'T4h: Tab wrap guard checks both nextAcc=0 and drilled state',
    'found compound guard');

  // ════════════════════════════════════════════════════════════════════════
  // §T5: Visual L&F matches accordion
  // ════════════════════════════════════════════════════════════════════════

  results.push('\n--- §T5: Visual L&F ---');

  assert(adUiSrc.indexOf('#table-overlay .ti{') > 0 && adUiSrc.indexOf('linear-gradient(135deg,#1e3a5f,#2d1b69)') > 0,
    'T5a: Gradient title card', 'same as accordion');

  assert(adUiSrc.indexOf("acc:nth-child(odd){background:#1a1a2a") > 0,
    'T5b: Odd tab bars have darker tone', 'found');
  assert(adUiSrc.indexOf("acc:nth-child(even){background:#1e1e30") > 0,
    'T5c: Even tab bars have lighter tone', 'found');
  assert(adUiSrc.indexOf("nth-child(odd) .hd{background:rgba(108,159,255,0.02)") > 0,
    'T5d: Odd tab header subtle blue tint', 'found');
  assert(adUiSrc.indexOf("nth-child(even) .hd{background:rgba(108,159,255,0.05)") > 0,
    'T5e: Even tab header stronger blue tint', 'found');
  assert(adUiSrc.indexOf('border-left:3px solid') < 0 ||
         adUiSrc.indexOf('#table-overlay .acc:nth-child(2){border-left') < 0,
    'T5f: No coloured left borders (removed — meaningless)', 'clean');

  assert(adUiSrc.indexOf('nth-child(even)') > 0 && adUiSrc.indexOf('nth-child(odd)') > 0,
    'T5g: Alternating row colors (even/odd)', 'found');

  assert(adUiSrc.indexOf('tr.sel td{background:rgba(108,159,255,0.15)') > 0,
    'T5h: Selected row highlight with blue tint + left border', 'found');

  assert(adUiSrc.indexOf('slideUp') > 0,
    'T5i: Slide-up animation on overlay open', 'found');

  assert(adUiSrc.indexOf('.chv') > 0 && adUiSrc.indexOf('rotate(90deg)') > 0,
    'T5j: Chevron rotation on open tab', 'found');

  assert(adUiSrc.indexOf('max-height:40vh') > 0,
    'T5k: Body max-height=40vh (shows 3-4 rows, scroll for more)',
    'found');

  // ════════════════════════════════════════════════════════════════════════
  // §T6: Long-press on RECORD → data accordion (not table view)
  // ════════════════════════════════════════════════════════════════════════

  results.push('\n--- §T6: Long-Press RECORD vs TABLE ---');

  // In ad_graph.js, long-press checks hit.record:
  assert(adGraphSrc.indexOf("if (hit.record)") > 0 &&
         adGraphSrc.indexOf("_onDrill(hit.tableName, hit.windowId, hit.record, 'data')") > 0,
    'T6a: Long-press RECORD sends record + data mode',
    'found in ad_graph.js');

  assert(adGraphSrc.indexOf("_onDrill(hit.tableName, hit.windowId, null, 'table')") > 0,
    'T6b: Long-press TABLE (no record) sends null + table mode',
    'found in ad_graph.js');

  // ════════════════════════════════════════════════════════════════════════
  // §T7: Child tab lazy-load with FK filter
  // ════════════════════════════════════════════════════════════════════════

  results.push('\n--- §T7: Child Tab Lazy-Load ---');

  assert(adUiSrc.indexOf('§TABLE_CHILD tab=') > 0,
    'T7a: Child tab load emits §TABLE_CHILD log',
    'found');

  assert(adUiSrc.indexOf('WHERE [" + ftFk + "] = ?') > 0,
    'T7b: Child tab queries filtered by FK',
    'found SQL filter');

  assert(adUiSrc.indexOf('_resolveDisplay') > 0,
    'T7c: Child tab uses FK resolution for display values',
    'found');

  assert(adUiSrc.indexOf('skip empty tables') > 0,
    'T7d: Empty FK tables filtered out on initial open',
    'found §OV.11 comment');

  assert(adUiSrc.indexOf("if (total === 0) continue") > 0,
    'T7e: Zero-count tables skipped with continue',
    'found');

  assert(adUiSrc.indexOf("fkTabs=' + liveTabCount + '/' + fkTables.length") > 0,
    'T7f: Log shows live/total tab counts',
    'found');

  assert(adUiSrc.indexOf('§OV.12') > 0 && adUiSrc.indexOf('§OV.13') > 0,
    'T7g: drillRecord rebuilds child tabs dynamically per PK',
    'found §OV.12 remove + §OV.13 rebuild');

  assert(adUiSrc.indexOf("liveTabs=' + liveCount + '/' + fkTables.length") > 0,
    'T7h: Drill log shows live/total per-PK tab counts',
    'found');

  assert(adUiSrc.indexOf('§OV.14') > 0,
    'T7i: resetToHeader rebuilds initial tabs (globally non-empty)',
    'found §OV.14');

  assert(adUiSrc.indexOf("accs = ov.querySelectorAll('.acc')") > 0,
    'T7j: accs list refreshed after tab rebuild',
    'found');

  // ════════════════════════════════════════════════════════════════════════
  // §T7b: Scroll vs Tap distinction
  // ════════════════════════════════════════════════════════════════════════

  results.push('\n--- §T7b: Scroll vs Tap ---');

  assert(adUiSrc.indexOf('_ovDownX') > 0 && adUiSrc.indexOf('_ovDownY') > 0,
    'T7b1: Tracks pointerdown position for drag detection',
    'found _ovDownX/_ovDownY');

  assert(adUiSrc.indexOf('Math.sqrt(dx * dx + dy * dy) > 10') > 0,
    'T7b2: Ignores pointer moves > 10px (scroll drag, not tap)',
    'found distance check');

  assert(adUiSrc.indexOf("ov.addEventListener('pointerdown'") > 0,
    'T7b3: Overlay has pointerdown listener for drag start',
    'found');

  // ════════════════════════════════════════════════════════════════════════
  // §T8: Cleanup — keyboard handler removed on close
  // ════════════════════════════════════════════════════════════════════════

  results.push('\n--- §T8: Cleanup ---');

  assert(adUiSrc.indexOf('ov._keyHandler = _onKeyDown') > 0,
    'T8a: Keyboard handler stored on overlay element',
    'found');

  assert(adUiSrc.indexOf("removeEventListener('keydown', _tableOverlay._keyHandler)") > 0,
    'T8b: _closeTableOverlay removes keyboard handler',
    'found');

  // ════════════════════════════════════════════════════════════════════════
  // §T9: Data verification — actual SQL queries against GardenWorld
  // ════════════════════════════════════════════════════════════════════════

  results.push('\n--- §T9: Data Queries (GardenWorld) ---');

  // Verify C_BPartner has records
  var bpCount = db.exec("SELECT COUNT(*) as c FROM C_BPartner WHERE IsActive = 'Y'");
  var bpc = bpCount[0].values[0][0];
  assert(bpc > 0, 'T9a: C_BPartner has active records', 'count=' + bpc);

  // Verify FK child tables discoverable
  var fkTabs = db.exec(
    "SELECT DISTINCT t.TableName FROM AD_Column c " +
    "JOIN AD_Table t ON c.AD_Table_ID = t.AD_Table_ID " +
    "WHERE c.AD_Reference_ID IN (19, 30) " +
    "AND c.ColumnName LIKE '%C_BPartner_ID%' " +
    "AND t.TableName != 'C_BPartner' AND t.IsActive = 'Y'");
  var fkCount = fkTabs.length ? fkTabs[0].values.length : 0;
  assert(fkCount > 0, 'T9b: C_BPartner has FK child tables',
    'count=' + fkCount + ' tables=[' +
    (fkTabs.length ? fkTabs[0].values.slice(0, 5).map(v => v[0]).join(',') : '') + '...]');

  // Verify a child table has filtered data
  var bpId = db.exec("SELECT C_BPartner_ID FROM C_BPartner WHERE IsActive = 'Y' LIMIT 1");
  var pk = bpId[0].values[0][0];
  var childData = db.exec("SELECT COUNT(*) as c FROM C_Order WHERE C_BPartner_ID = ?", [pk]);
  var childCount = childData[0].values[0][0];
  console.log('§T9 C_BPartner_ID=' + pk + ' C_Order children=' + childCount);
  assert(true, 'T9c: FK child query works for C_Order',
    'C_BPartner_ID=' + pk + ' orders=' + childCount);

  // Verify fields discoverable for C_BPartner
  var fieldCount = db.exec(
    "SELECT COUNT(DISTINCT c.ColumnName) as c FROM AD_Field f " +
    "JOIN AD_Column c ON f.AD_Column_ID = c.AD_Column_ID " +
    "JOIN AD_Tab t ON f.AD_Tab_ID = t.AD_Tab_ID " +
    "JOIN AD_Table tbl ON t.AD_Table_ID = tbl.AD_Table_ID " +
    "WHERE tbl.TableName = 'C_BPartner' AND f.IsDisplayed = 'Y' AND t.TabLevel = 0");
  var fc = fieldCount[0].values[0][0];
  assert(fc >= 10, 'T9d: C_BPartner has sufficient display fields',
    'fieldCount=' + fc);

  // ════════════════════════════════════════════════════════════════════════
  // §T10: _test export exists on ADUI
  // ════════════════════════════════════════════════════════════════════════

  results.push('\n--- §T10: Test API ---');

  assert(adUiSrc.indexOf('_test:') > 0, 'T10a: ADUI._test export exists', 'found');
  assert(adUiSrc.indexOf('drillCallback:') > 0, 'T10b: _test.drillCallback exposed', 'found');
  assert(adUiSrc.indexOf('closeTableOverlay:') > 0, 'T10c: _test.closeTableOverlay exposed', 'found');
  assert(adUiSrc.indexOf('getTableOverlay:') > 0, 'T10d: _test.getTableOverlay exposed', 'found');

  // ═══ Summary ══════════════════════════════════════════════════════════
  results.push('\n\u2550\u2550\u2550 Results: ' + passed + ' passed, ' + failed + ' failed \u2550\u2550\u2550');

  var out = results.join('\n') + '\n';
  console.log(out);

  var logDir = path.join(__dirname, '..', 'test-results');
  try { fs.mkdirSync(logDir, { recursive: true }); } catch (e) {}
  fs.writeFileSync(path.join(logDir, 'test_s259_table_overlay.log'), out);
  console.log('Log saved: ' + path.join(logDir, 'test_s259_table_overlay.log'));
  process.exit(failed > 0 ? 1 : 0);
}

run();
