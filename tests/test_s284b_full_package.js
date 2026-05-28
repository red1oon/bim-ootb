/**
 * BIM OOTB — §S284b FULL PACKAGER SIMULATION.
 * Issue: 6MB web-ifc as JSON string literal inside <script> causes HTML parser failure.
 * Fix: <script type="text/plain" id="webifc-src"> stores content as inert text.
 *
 * This test simulates the REAL packageLandingPage() flow:
 * 1. Reads index.html
 * 2. Inlines external scripts
 * 3. Embeds web-ifc as <script type="text/plain">
 * 4. Writes output to /tmp/BIM-OOTB.html
 * 5. Validates: size, structure, JS parse, no unescaped </script>
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(id, ok, detail) {
  if (ok) { pass++; console.log('  PASS ' + id); }
  else { fail++; console.log('  FAIL ' + id + (detail ? ' — ' + detail : '')); }
}

const root = path.join(__dirname, '..');
const viewerDir = path.join(root, 'viewer');

console.log('\n§S284b_FULL_PACKAGE Simulating real packageLandingPage()');

// ── Step 1: Read source files ──
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var dbBuilderSrc = fs.readFileSync(path.join(viewerDir, 'import_db_builder.js'), 'utf8');
var localeSrc = fs.readFileSync(path.join(viewerDir, 'locale_loader.js'), 'utf8');
var importWorkerSrc = fs.readFileSync(path.join(viewerDir, 'import_worker.js'), 'utf8');
var meshWorkerSrc = '';
try { meshWorkerSrc = fs.readFileSync(path.join(viewerDir, 'mesh_import_worker.js'), 'utf8'); } catch(e) {}
var exportWorkerSrc = '';
try { exportWorkerSrc = fs.readFileSync(path.join(viewerDir, 'ifc_export_worker.js'), 'utf8'); } catch(e) {}
var sqlWasmJs = fs.readFileSync(path.join(viewerDir, 'lib', 'sql-wasm.js'), 'utf8');
var sqlWasmBuf = fs.readFileSync(path.join(viewerDir, 'lib', 'sql-wasm.wasm'));
var sqlWasmB64 = sqlWasmBuf.toString('base64');
var webIfcSrc = fs.readFileSync(path.join(viewerDir, 'lib', 'web-ifc-api-iife.js'), 'utf8');

console.log('  Source files loaded:');
console.log('    index.html: ' + html.length + ' bytes');
console.log('    import_db_builder.js: ' + dbBuilderSrc.length + ' bytes');
console.log('    locale_loader.js: ' + localeSrc.length + ' bytes');
console.log('    import_worker.js: ' + importWorkerSrc.length + ' bytes');
console.log('    sql-wasm.js: ' + sqlWasmJs.length + ' bytes');
console.log('    sql-wasm.wasm (base64): ' + sqlWasmB64.length + ' bytes');
console.log('    web-ifc-api-iife.js: ' + webIfcSrc.length + ' bytes');

// ── Step 2: Inline external scripts ──
// §S284b: Function replacement avoids $' $& $` corruption in inlined sources
html = html.replace(/<script src="viewer\/import_db_builder\.js[^"]*"><\/script>/, function() { return '<script>\n' + dbBuilderSrc + '\n<\/script>'; });
html = html.replace(/<script src="viewer\/locale_loader\.js[^"]*"><\/script>/, function() { return '<script>\n' + localeSrc + '\n<\/script>'; });

check('2.1 import_db_builder inlined', html.indexOf('buildImportDBs') >= 0);
check('2.2 no remaining external script src for import_db_builder',
  !/<script src="viewer\/import_db_builder/.test(html));
check('2.3 no remaining external script src for locale_loader',
  !/<script src="viewer\/locale_loader/.test(html));

// ── Step 3: Build standalone config block ──
var workerJSON = JSON.stringify({
  'import_worker.js': importWorkerSrc,
  'mesh_import_worker.js': meshWorkerSrc,
  'ifc_export_worker.js': exportWorkerSrc
});
var manifestJSON = JSON.stringify({archetypes: [{name: 'Test', db: 'test.db'}]});

// Simulate fetching web-ifc.wasm from local cache if available
var webIfcWasmB64 = '';
var wasmPath = path.join(viewerDir, 'lib', 'web-ifc.wasm');
if (fs.existsSync(wasmPath)) {
  webIfcWasmB64 = fs.readFileSync(wasmPath).toString('base64');
  console.log('  web-ifc.wasm (base64): ' + webIfcWasmB64.length + ' bytes');
} else {
  console.log('  web-ifc.wasm: not found locally — §S284b WASM offline test skipped');
}

var standaloneBlock = '// §S284b: Standalone offline copy\n' +
  'window._STANDALONE = true;\n' +
  'window._MANIFEST_SNAPSHOT = ' + manifestJSON + ';\n' +
  'window._WORKER_SOURCES = ' + workerJSON + ';\n' +
  'window._SQL_WASM_JS = ' + JSON.stringify(sqlWasmJs) + ';\n' +
  'window._SQL_WASM_B64 = "' + sqlWasmB64 + '";\n' +
  (webIfcWasmB64 ? 'window._WEBIFC_WASM_B64 = "' + webIfcWasmB64 + '";\n' : '');

var configMarker = '// \u2500\u2500 Config \u2500\u2500';
check('3.1 config marker found', html.indexOf(configMarker) >= 0);
html = html.replace(configMarker, function() { return standaloneBlock + configMarker; });
check('3.2 _STANDALONE injected', html.indexOf('_STANDALONE = true') >= 0);

// ── Step 4: §S284b — Embed web-ifc as <script type="text/plain"> ──
console.log('\n§S284b_FULL_PACKAGE Embedding web-ifc (' + webIfcSrc.length + ' bytes)');

// Check for </script> in web-ifc source
var scriptCloseCount = (webIfcSrc.match(/<\/script>/gi) || []).length;
console.log('  </script> occurrences in web-ifc source: ' + scriptCloseCount);

var safeWebIfc = webIfcSrc.replace(/<\/script>/gi, '<\\/script>');
var escapedCount = (safeWebIfc.match(/<\\\/script>/gi) || []).length;
check('4.1 all </script> escaped (' + scriptCloseCount + ' found, ' + escapedCount + ' escaped)',
  escapedCount === scriptCloseCount);
check('4.2 no unescaped </script> remains',
  safeWebIfc.indexOf('</script>') < 0 && safeWebIfc.indexOf('</SCRIPT>') < 0);

html = html.replace('<body>', function() { return '<script type="text/plain" id="webifc-src">\n' + safeWebIfc + '\n<\/script>\n<body>'; });
check('4.3 webifc-src block inserted before <body>',
  html.indexOf('<script type="text/plain" id="webifc-src">') >= 0);

// ── Step 5: Strip analytics + fix URLs ──
html = html.replace(/<script[^>]*goatcounter[^>]*><\/script>/g, '');
html = html.replace(/src="Sysnova\.png"/g, 'src="data:image/png;base64,MOCK"');
var ghBase = 'https://red1oon.github.io/bim-ootb/';
html = html.replace(
  /const viewerFile = [^;]+;/,
  "const viewerFile = '" + ghBase + "viewer/viewer.html';"
);

// ── Step 6: Write output ──
var outputPath = '/tmp/BIM-OOTB.html';
fs.writeFileSync(outputPath, html, 'utf8');
var stat = fs.statSync(outputPath);
console.log('\n§S284b_FULL_PACKAGE Output: ' + outputPath + ' (' + stat.size + ' bytes, ' + (stat.size / 1024 / 1024).toFixed(1) + 'MB)');

// ── Step 7: Validate output HTML ──
console.log('\n§S284b_FULL_PACKAGE Validating output HTML');

var output = fs.readFileSync(outputPath, 'utf8');

check('7.1 output size > 6MB (web-ifc embedded)',
  output.length > 6000000,
  'size=' + output.length + ' (' + (output.length / 1024 / 1024).toFixed(1) + 'MB)');

check('7.2 has <!DOCTYPE html>', output.indexOf('<!DOCTYPE html>') >= 0 || output.indexOf('<!doctype html>') >= 0);
check('7.3 has <html>', /<html/i.test(output));
check('7.4 has <body>', /<body/i.test(output));
check('7.5 has </html>', /<\/html>/i.test(output));

// ── Step 8: Validate webifc-src block ──
console.log('\n§S284b_FULL_PACKAGE Validating webifc-src block');

var webIfcStart = output.indexOf('<script type="text/plain" id="webifc-src">');
check('8.1 webifc-src block found in output', webIfcStart >= 0);

if (webIfcStart >= 0) {
  var contentStart = output.indexOf('\n', webIfcStart) + 1;
  // Find the FIRST </script> after the opening tag — this is the close of our block
  var contentEnd = output.indexOf('</script>', contentStart);
  var webIfcContent = output.slice(contentStart, contentEnd);

  // Allow up to 200 bytes tolerance from trim/whitespace differences
  check('8.2 webifc content size matches escaped source (within 200 bytes)',
    Math.abs(webIfcContent.trim().length - safeWebIfc.length) < 200,
    'content=' + webIfcContent.trim().length + ' expected~' + safeWebIfc.length + ' diff=' + Math.abs(webIfcContent.trim().length - safeWebIfc.length));

  check('8.3 no literal </script> inside webifc content',
    webIfcContent.indexOf('</script>') < 0);

  check('8.4 webifc block is before <body>',
    webIfcStart < output.indexOf('<body>'));

  // Verify the content contains web-ifc signatures
  check('8.5 webifc content has WebIFC signature',
    webIfcContent.indexOf('WebIFC') >= 0 || webIfcContent.indexOf('web-ifc') >= 0 || webIfcContent.indexOf('IfcAPI') >= 0);
}

// ── Step 9: Validate all <script> blocks parse as JS ──
console.log('\n§S284b_FULL_PACKAGE Validating JS parse of all script blocks');

var scriptBlocks = output.match(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/g) || [];
check('9.1 multiple script blocks found', scriptBlocks.length > 3,
  'count=' + scriptBlocks.length);

var parseErrors = 0;
var skippedBlocks = 0;
scriptBlocks.forEach(function(block, i) {
  // Skip type=text/plain (not JS)
  if (/type="text\/plain"/.test(block)) { skippedBlocks++; return; }
  // Skip src= tags (external, no inline content)
  if (/\ssrc=/.test(block) && block.replace(/<script[^>]*>/, '').replace(/<\/script>$/, '').trim() === '') return;
  var js = block.replace(/<script[^>]*>/, '').replace(/<\/script>$/, '');
  if (js.trim().length === 0) return;
  try {
    new Function(js);
  } catch(e) {
    parseErrors++;
    // Show first 200 chars of the problematic block for diagnosis
    console.log('  PARSE ERROR block #' + i + ': ' + e.message);
    console.log('    First 200 chars: ' + js.slice(0, 200).replace(/\n/g, '\\n'));
  }
});

check('9.2 type=text/plain blocks skipped (not parsed as JS)',
  skippedBlocks >= 1,
  'skipped=' + skippedBlocks);

check('9.3 ALL executable <script> blocks parse as valid JS',
  parseErrors === 0,
  parseErrors > 0 ? parseErrors + ' blocks failed to parse' : '');

// ── Step 10: Standalone config present ──
console.log('\n§S284b_FULL_PACKAGE Standalone config verification');

check('10.1 _STANDALONE = true present', output.indexOf('_STANDALONE = true') >= 0);
check('10.2 _MANIFEST_SNAPSHOT present', output.indexOf('_MANIFEST_SNAPSHOT') >= 0);
check('10.3 _WORKER_SOURCES present', output.indexOf('_WORKER_SOURCES') >= 0);
check('10.4 _SQL_WASM_JS present', output.indexOf('_SQL_WASM_JS') >= 0);
check('10.5 _SQL_WASM_B64 present', output.indexOf('_SQL_WASM_B64') >= 0);
check('10.6 NO _WEBIFC_SRC variable (replaced by DOM element)',
  !/window\._WEBIFC_SRC\s*=/.test(output));
check('10.7 GitHub Pages viewer URL present',
  output.indexOf('red1oon.github.io/bim-ootb/viewer/viewer.html') >= 0);
if (webIfcWasmB64) {
  check('10.8 _WEBIFC_WASM_B64 present when WASM available',
    output.indexOf('_WEBIFC_WASM_B64') >= 0);
}
check('10.9 _createWorker injects _WEBIFC_WASM_URL into import worker',
  output.indexOf('_WEBIFC_WASM_URL') >= 0);
check('10.10 import_worker.js uses _WEBIFC_WASM_URL in locateFile',
  importWorkerSrc.indexOf('_WEBIFC_WASM_URL') >= 0);

// ── Step 11: _createWorker reads from DOM ──
console.log('\n§S284b_FULL_PACKAGE _createWorker DOM read');

check('11.1 _createWorker uses getElementById webifc-src',
  output.indexOf("getElementById('webifc-src')") >= 0);
check('11.2 _createWorker reads .textContent',
  output.indexOf('webIfcEl.textContent') >= 0);

// ── Summary ──
console.log('\n§PACK_DOWNLOAD size=' + stat.size + ' bytes (' + (stat.size / 1024 / 1024).toFixed(1) + 'MB)');
console.log('\n' + pass + ' PASS, ' + fail + ' FAIL — ' + (pass + fail) + ' total');
console.log('Output written to: ' + outputPath);
if (fail > 0) process.exit(1);
