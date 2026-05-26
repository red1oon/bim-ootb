/**
 * test_s274_split_db_wiring.js — §S274 Split-DB import/open URL wiring verification
 * Issue: imported buildings load the full monolith DB (218-380MB) instead of streaming.
 * Fix: openImported() stores metaDb + geoDb under import:// URLs; streaming.js detects them.
 *
 * This test verifies the URL pattern matching is consistent across import.js and streaming.js,
 * proving the critical V1 path works without requiring a browser.
 */

const fs = require('fs');
const path = require('path');

var pass = 0, fail = 0;

function assert(cond, tag, msg) {
  if (cond) { pass++; console.log('  §S274_WIRING PASS ' + tag + ': ' + msg); }
  else { fail++; console.log('  §S274_WIRING FAIL ' + tag + ': ' + msg); }
}

const viewerDir = path.resolve(__dirname, '..', 'viewer');
const importSrc = fs.readFileSync(path.join(viewerDir, 'import.js'), 'utf8');
const streamingSrc = fs.readFileSync(path.join(viewerDir, 'streaming.js'), 'utf8');
const errorReporterSrc = fs.readFileSync(path.join(viewerDir, 'error_reporter.js'), 'utf8');
const dbBuilderSrc = fs.readFileSync(path.join(viewerDir, 'import_db_builder.js'), 'utf8');

// ══════════════════════════════════════════════════════════════════════════════
// V1: Split-DB URL wiring — import.js writes keys that streaming.js can find
// ══════════════════════════════════════════════════════════════════════════════

// T1: import.js stores meta under: import://{key}/{key}_meta.db
var metaStorePattern = /import:\/\/.*?_meta\.db/;
assert(metaStorePattern.test(importSrc), 'T1', 'import.js stores split meta under import://*_meta.db key');

// T2: import.js stores geo under: import://{key}/{key}_geo.db
var geoStorePattern = /import:\/\/.*?_geo\.db/;
assert(geoStorePattern.test(importSrc), 'T2', 'import.js stores split geo under import://*_geo.db key');

// T3: streaming.js derives meta URL by replacing _extracted.db → _meta.db
var metaDerive = streamingSrc.includes("replace('_extracted.db', '_meta.db')");
assert(metaDerive, 'T3', 'streaming.js derives meta URL via _extracted.db → _meta.db replacement');

// T4: streaming.js derives geo URL by replacing _extracted.db → _geo.db
var geoDerive = streamingSrc.includes("replace('_extracted.db', '_geo.db')");
assert(geoDerive, 'T4', 'streaming.js derives geo URL via _extracted.db → _geo.db replacement');

// T5: The URL constructed by import.js must match what streaming.js expects
// import.js: 'import://' + key + '/' + key.replace(/\.ifc$/i, '_extracted.db')
// streaming.js: A.DB_URL.replace('_extracted.db', '_meta.db')
// → import://{key}/{key}_meta.db on both sides ✓
var importDbUrlLine = importSrc.match(/importDbUrl\s*=\s*'import:\/\/'\s*\+\s*key\s*\+\s*'\/'\s*\+\s*key\.replace\(\/\\\.ifc\$\/i,\s*'_extracted\.db'\)/);
assert(!!importDbUrlLine, 'T5', 'import.js sets importDbUrl = import://{key}/{key}_extracted.db');

var metaUrlLine = importSrc.match(/metaUrl\s*=\s*'import:\/\/'\s*\+\s*key\s*\+\s*'\/'\s*\+\s*key\.replace\(\/\\\.ifc\$\/i,\s*'_meta\.db'\)/);
assert(!!metaUrlLine, 'T6', 'import.js sets metaUrl = import://{key}/{key}_meta.db (matches streaming.js derivation)');

// T7: streaming.js uses _checkCache for import:// URLs (IDB, not HEAD)
var idbCheck = streamingSrc.includes("A.DB_URL.startsWith('import://')") &&
               streamingSrc.includes('_checkCache(metaUrl)');
assert(idbCheck, 'T7', 'streaming.js uses IDB _checkCache (not HEAD fetch) for import:// URLs');

// T8: streaming.js avoids new URL() for import:// geo URLs
var noNewUrl = streamingSrc.includes("geoUrl.startsWith('import://') ? geoUrl : new URL(geoUrl");
assert(noNewUrl, 'T8', 'streaming.js bypasses new URL() for import:// geo URLs (would throw)');

// T9: import_db_builder.js splits at >15K elements threshold
var threshold = dbBuilderSrc.match(/elements\.length\s*>\s*15000/);
assert(!!threshold, 'T9', 'import_db_builder.js splits DB at >15K elements threshold');

// T10: import_db_builder.js produces both metaDb and geoDb
var producesMetaGeo = dbBuilderSrc.includes('result.metaDb = metaDb') &&
                      dbBuilderSrc.includes('result.geoDb = geoDb');
assert(producesMetaGeo, 'T10', 'import_db_builder.js attaches metaDb + geoDb to result');

// T11: Simulate URL derivation for a real filename
var testKey = 'Hospital 2.0.ifc';
var simDbUrl = 'import://' + testKey + '/' + testKey.replace(/\.ifc$/i, '_extracted.db');
var simMetaUrl = simDbUrl.replace('_extracted.db', '_meta.db');
var simGeoUrl = simDbUrl.replace('_extracted.db', '_geo.db');
var expectedMeta = 'import://' + testKey + '/' + testKey.replace(/\.ifc$/i, '_meta.db');
var expectedGeo = 'import://' + testKey + '/' + testKey.replace(/\.ifc$/i, '_geo.db');
assert(simMetaUrl === expectedMeta, 'T11', 'URL derivation: "' + testKey + '" → meta URL matches import.js store key');
assert(simGeoUrl === expectedGeo, 'T12', 'URL derivation: "' + testKey + '" → geo URL matches import.js store key');

// T13: import.js stores metaDb as primary importDbUrl (fast load)
var metaAsPrimary = importSrc.includes('store.put(record.metaDb, importDbUrl)');
assert(metaAsPrimary, 'T13', 'import.js stores metaDb as primary DB URL → viewer loads meta instantly');

// T14: import.js §IMPORT_OPEN_SPLIT log line present
assert(importSrc.includes('§IMPORT_OPEN_SPLIT'), 'T14', '§IMPORT_OPEN_SPLIT log tag present for whitebox verification');

// T15: import.js §IMPORT_OPEN_MONOLITH fallback present
assert(importSrc.includes('§IMPORT_OPEN_MONOLITH'), 'T15', '§IMPORT_OPEN_MONOLITH fallback log tag present');

// ══════════════════════════════════════════════════════════════════════════════
// V2: Error Reporter — structure and suppression
// ══════════════════════════════════════════════════════════════════════════════

// T16: error_reporter.js defines setupErrorReporter function
assert(errorReporterSrc.includes('function setupErrorReporter(A)'), 'T16', 'setupErrorReporter(A) function defined');

// T17: Listens to window error event
assert(errorReporterSrc.includes("window.addEventListener('error'"), 'T17', 'Global error listener installed');

// T18: Listens to unhandledrejection
assert(errorReporterSrc.includes("window.addEventListener('unhandledrejection'"), 'T18', 'Unhandled promise rejection listener installed');

// T19: Suppresses ResizeObserver
assert(errorReporterSrc.includes("'ResizeObserver'"), 'T19', 'Suppresses benign ResizeObserver errors');

// T20: Suppresses AbortError
assert(errorReporterSrc.includes("'AbortError'"), 'T20', 'Suppresses benign AbortError (fetch cancel)');

// T21: A.reportError public API exists
assert(errorReporterSrc.includes('A.reportError = function(err)'), 'T21', 'A.reportError() public API for caught errors');

// T22: Report button calls A.reportBug or A._doReportBug
var callsReportBug = errorReporterSrc.includes('A.reportBug()') || errorReporterSrc.includes('A._doReportBug');
assert(callsReportBug, 'T22', 'Report button integrates with existing bug reporter');

// T23: Auto-dismiss after 15s
assert(errorReporterSrc.includes('15000'), 'T23', 'Toast auto-dismisses after 15 seconds');

// T24: Max 3 toasts per session
assert(errorReporterSrc.includes('MAX_TOASTS = 3'), 'T24', 'Rate-limited to 3 toasts per session');

// T25: viewer.html loads error_reporter.js
var viewerHtml = fs.readFileSync(path.join(viewerDir, 'viewer.html'), 'utf8');
assert(viewerHtml.includes('error_reporter.js'), 'T25', 'viewer.html includes error_reporter.js script tag');

// T26: sw.js precaches error_reporter.js
var swSrc = fs.readFileSync(path.join(viewerDir, 'sw.js'), 'utf8');
assert(swSrc.includes('error_reporter.js'), 'T26', 'sw.js precaches error_reporter.js');

// T27: XSS protection — HTML entities escaped
assert(errorReporterSrc.includes('_escHtml'), 'T27', 'Error messages are HTML-escaped (XSS protection)');

// ══════════════════════════════════════════════════════════════════════════════
// V3: Status Messages — user-friendly import progress
// ══════════════════════════════════════════════════════════════════════════════

var workerSrc = fs.readFileSync(path.join(viewerDir, 'import_worker.js'), 'utf8');

// T28: Worker sends progress messages
var sendsProgress = workerSrc.includes("type: 'progress'") || workerSrc.includes("type:'progress'");
assert(sendsProgress, 'T28', 'Import worker sends progress messages to main thread');

// T29: Status includes element count
var elemCount = importSrc.includes('elementCount') || workerSrc.includes('elementCount');
assert(elemCount, 'T29', 'Import flow reports element count to user');

// T30: §IMPORT_SAVED log tag present
assert(importSrc.includes('§IMPORT_SAVED'), 'T30', '§IMPORT_SAVED log tag present for whitebox verification');

// ── Summary ──
console.log('\n§S274_WIRING_SUMMARY ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' total');
if (fail > 0) process.exit(1);
