/**
 * BIM OOTB — §S284 Packager mock test.
 * Simulates packageLandingPage() logic against real index.html source.
 * Catches: unescaped strings, duplicate scripts, broken config injection, _base undefined.
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(id, ok, detail) {
  if (ok) { pass++; console.log('  PASS ' + id); }
  else { fail++; console.log('  FAIL ' + id + (detail ? ' — ' + detail : '')); }
}

const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// §S284 fix: packager now fetches original HTML source (not innerHTML).
// Our mock uses the raw file — exactly what the browser fetch returns.
var html = indexSrc;

console.log('\n§S284_PACKAGER_TEST Simulating packageLandingPage()');

// ── Step 1: Check that external script tags exist for replacement ──
var dbBuilderMatch = html.match(/<script src="viewer\/import_db_builder\.js[^"]*"><\/script>/);
check('1.1 import_db_builder.js <script src> found', !!dbBuilderMatch);

var localeMatch = html.match(/<script src="viewer\/locale_loader\.js[^"]*"><\/script>/);
check('1.2 locale_loader.js <script src> found', !!localeMatch);

// ── Step 2: Simulate replacing external scripts with inline ──
var fakeSrc = 'console.log("test inline script");';
html = html.replace(/<script src="viewer\/import_db_builder\.js[^"]*"><\/script>/, '<script>\n' + fakeSrc + '\n<\/script>');
html = html.replace(/<script src="viewer\/locale_loader\.js[^"]*"><\/script>/, '<script>\n' + fakeSrc + '\n<\/script>');

// Verify no remaining external script src for these files
check('2.1 no remaining import_db_builder src tag',
  !/<script src="viewer\/import_db_builder/.test(html));
check('2.2 no remaining locale_loader src tag',
  !/<script src="viewer\/locale_loader/.test(html));

// ── Step 3: Config tag injection (now plain string replace on raw source) ──
var configMarker = '// \u2500\u2500 Config \u2500\u2500';
var configFound = html.indexOf(configMarker);
check('3.1 config marker found in raw HTML', configFound >= 0);

if (configFound >= 0) {
  var testBlock = 'window._STANDALONE = true;\nwindow._MANIFEST_SNAPSHOT = {};\n';
  html = html.replace(configMarker, testBlock + configMarker);
  check('3.2 _STANDALONE injected before Config marker', html.indexOf('_STANDALONE = true') < html.indexOf(configMarker));
  check('3.3 _base defined AFTER _STANDALONE', html.indexOf('_STANDALONE = true') < html.indexOf('const _base'));
}

// ── Step 4: Check for </script> inside JSON.stringify'd content ──
// This is the #1 packager bug: if sql-wasm.js contains </script>, it breaks the HTML
var sqlWasmJs = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'lib', 'sql-wasm.js'), 'utf8');
var sqlWasmStringified = JSON.stringify(sqlWasmJs);
check('4.1 sql-wasm.js JSON.stringify does not contain literal </script>',
  sqlWasmStringified.indexOf('</script>') < 0,
  sqlWasmStringified.indexOf('</script>') >= 0 ? 'DANGER: </script> in stringified source will break HTML' : '');

// Check worker sources too
var importWorkerSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'import_worker.js'), 'utf8');
var workerStringified = JSON.stringify(importWorkerSrc);
check('4.2 import_worker.js JSON.stringify safe',
  workerStringified.indexOf('</script>') < 0);

// ── Step 5: Check that JSON.stringify'd content has no unescaped newlines ──
// JSON.stringify SHOULD escape \n to \\n. Verify.
check('5.1 JSON.stringify escapes newlines in sql-wasm.js',
  sqlWasmStringified.indexOf('\n') < 0 || sqlWasmStringified.charAt(0) === '"');
// Actually JSON.stringify always escapes \n to \\n inside strings. But let's check
// that raw assignment `window._SQL_WASM_JS = "..."` doesn't have literal newlines.
var rawAssignment = 'window._SQL_WASM_JS = ' + sqlWasmStringified + ';';
var lines = rawAssignment.split('\n');
check('5.2 sql-wasm.js assignment is single line (no unescaped breaks)',
  lines.length === 1,
  lines.length > 1 ? 'has ' + lines.length + ' lines — will cause SyntaxError' : '');

// ── Step 6: web-ifc source check (§S284b: now embedded as <script type="text/plain">) ──
var mockWebIfc = 'var WebIFC = {}; // mock\nconsole.log("web-ifc loaded");\nvar x = "</script>";';
// §S284b: escape </script> inside the source
var safeWebIfc = mockWebIfc.replace(/<\/script>/gi, '<\\/script>');
check('6.1 web-ifc </script> escaped for type=text/plain',
  safeWebIfc.indexOf('</script>') < 0,
  safeWebIfc.indexOf('</script>') >= 0 ? 'DANGER: unescaped </script> will close the block' : '');
check('6.2 escaped form preserves content (reversible)',
  safeWebIfc.replace(/<\\\/script>/gi, '</script>') === mockWebIfc);

// §S284b: Simulate embedding as <script type="text/plain">
var webIfcBlock = '<script type="text/plain" id="webifc-src">\n' + safeWebIfc + '\n<\/script>';
check('6.3 webifc block has type=text/plain', /type="text\/plain"/.test(webIfcBlock));
check('6.4 webifc block has id=webifc-src', /id="webifc-src"/.test(webIfcBlock));
// Verify no literal </script> inside the content (between opening and closing tags)
var innerContent = webIfcBlock.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
check('6.5 no literal </script> inside webifc block content',
  innerContent.indexOf('</script>') < 0);

// ── Step 7: WASM base64 check ──
var wasmBuf = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'lib', 'sql-wasm.wasm'));
var wasmB64 = wasmBuf.toString('base64');
check('7.1 sql-wasm.wasm base64 size', wasmB64.length > 800000,
  'base64 size=' + wasmB64.length);
check('7.2 base64 has no line breaks', wasmB64.indexOf('\n') < 0);
check('7.3 base64 has no quotes', wasmB64.indexOf('"') < 0 && wasmB64.indexOf("'") < 0);
// Verify assignment is safe
var wasmAssignment = 'window._SQL_WASM_B64 = "' + wasmB64 + '";';
check('7.4 wasm base64 assignment is single line', wasmAssignment.split('\n').length === 1);

// ── Step 8: Goatcounter stripped ──
check('8.1 goatcounter tag exists in source', indexSrc.indexOf('goatcounter') >= 0);
var stripped = html.replace(/<script[^>]*goatcounter[^>]*><\/script>/g, '');
// Count remaining goatcounter references (may be in comments — that's OK)
var gcScripts = (stripped.match(/<script[^>]*goatcounter[^>]*>/g) || []);
check('8.2 goatcounter script tags stripped', gcScripts.length === 0);

// ── Step 9: Sysnova.png replacement ──
var pngCount = (html.match(/src="Sysnova\.png"/g) || []).length;
check('9.1 Sysnova.png src refs exist', pngCount > 0, 'found ' + pngCount);
var replaced = html.replace(/src="Sysnova\.png"/g, 'src="data:image/png;base64,AAAA"');
check('9.2 all Sysnova.png refs replaced',
  (replaced.match(/src="Sysnova\.png"/g) || []).length === 0);

// ── Step 10: viewerFile URL fix ──
check('10.1 viewerFile pattern exists',
  /const viewerFile = [^;]+;/.test(html));
var fixedHtml = html.replace(
  /const viewerFile = [^;]+;/,
  "const viewerFile = 'https://red1oon.github.io/bim-ootb/viewer/viewer.html';"
);
check('10.2 viewerFile rewritten to absolute GitHub Pages',
  fixedHtml.indexOf("'https://red1oon.github.io/bim-ootb/viewer/viewer.html'") >= 0);

// ── Step 11: Duplicate locale_loader check ──
// After inlining, there should be exactly 0 <script src="viewer/locale_loader.js"> tags
var localeScriptTags = (html.match(/<script src="viewer\/locale_loader/g) || []);
check('11.1 no duplicate locale_loader <script src> after inlining',
  localeScriptTags.length === 0,
  localeScriptTags.length > 0 ? 'found ' + localeScriptTags.length + ' remaining' : '');

// ── Step 12: _STANDALONE guard in locale_loader.js ──
var localeSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'locale_loader.js'), 'utf8');
check('12.1 locale_loader has _STANDALONE early return',
  localeSrc.indexOf('_STANDALONE') >= 0);
// The inlined version should also have it
check('12.2 _STANDALONE appears before first fetch in locale_loader',
  localeSrc.indexOf('_STANDALONE') < localeSrc.indexOf("fetch(url)"));

// ── Summary ──
console.log('\n' + pass + ' PASS, ' + fail + ' FAIL — ' + (pass + fail) + ' total');
if (fail > 0) process.exit(1);
