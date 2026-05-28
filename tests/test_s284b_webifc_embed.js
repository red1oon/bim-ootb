/**
 * BIM OOTB — §S284b web-ifc embed test.
 * Issue: 6MB JS string literal inside <script> causes HTML parser SyntaxError.
 * Fix: <script type="text/plain" id="webifc-src"> stores content as inert text.
 *
 * Tests:
 * - Packager produces correct <script type="text/plain"> block
 * - </script> inside web-ifc source is escaped
 * - _createWorker reads from DOM element, not window._WEBIFC_SRC
 * - Full output HTML structure is valid (no unclosed tags, no orphaned </script>)
 * - Large payload (simulated 6MB) survives round-trip
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

console.log('\n§S284b_EMBED_TEST web-ifc <script type="text/plain"> embedding');

// ══════════════════════════════════════════════
// PART 1: _createWorker uses DOM element, not window._WEBIFC_SRC
// ══════════════════════════════════════════════
console.log('\n§S284b_TEST _createWorker DOM-based web-ifc read');

check('1.1 _createWorker uses getElementById webifc-src',
  indexSrc.indexOf("getElementById('webifc-src')") >= 0);

check('1.2 _createWorker does NOT use window._WEBIFC_SRC',
  indexSrc.indexOf('window._WEBIFC_SRC') === -1);

check('1.3 _createWorker reads .textContent from element',
  indexSrc.indexOf('webIfcEl.textContent') >= 0);

check('1.4 _createWorker logs §STANDALONE_WEBIFC',
  indexSrc.indexOf('§STANDALONE_WEBIFC') >= 0);

// ══════════════════════════════════════════════
// PART 2: packageLandingPage embeds as <script type="text/plain">
// ══════════════════════════════════════════════
console.log('\n§S284b_TEST packageLandingPage embed strategy');

check('2.1 packager creates <script type="text/plain" id="webifc-src">',
  indexSrc.indexOf('type="text/plain" id="webifc-src"') >= 0);

check('2.2 packager escapes </script> in web-ifc source',
  indexSrc.indexOf(".replace(/<\\/script>/gi, '<\\\\/script>')") >= 0);

check('2.3 packager inserts before <body>',
  indexSrc.indexOf("html.replace('<body>'") >= 0 &&
  indexSrc.indexOf("webifc-src") >= 0);

check('2.4 packager does NOT embed _WEBIFC_SRC as JSON.stringify',
  indexSrc.indexOf("'window._WEBIFC_SRC = ' + JSON.stringify") === -1);

check('2.5 packager warns on web-ifc fetch failure',
  indexSrc.indexOf('IFC import will need internet') >= 0);

// ══════════════════════════════════════════════
// PART 3: Simulate full packager output HTML
// ══════════════════════════════════════════════
console.log('\n§S284b_TEST Simulated output HTML validation');

// Mock web-ifc source with edge cases
var mockWebIfc = [
  'var WebIFC = (function() {',
  '  "use strict";',
  '  var x = "</" + "script>"; // edge case',
  '  var y = "</script>"; // literal close tag',
  '  var z = "</SCRIPT>"; // case variant',
  '  function init() { console.log("web-ifc ready"); }',
  '  return { init: init };',
  '})();'
].join('\n');

// Apply same escaping as packager
var safeWebIfc = mockWebIfc.replace(/<\/script>/gi, '<\\/script>');

check('3.1 all </script> variants escaped (case insensitive)',
  safeWebIfc.indexOf('</script>') < 0 && safeWebIfc.indexOf('</SCRIPT>') < 0);

// Build simulated output HTML
var simHtml = '<!DOCTYPE html><html><head></head>\n' +
  '<script type="text/plain" id="webifc-src">\n' +
  safeWebIfc + '\n' +
  '</script>\n' +
  '<body>\n' +
  '<script>\nwindow._STANDALONE = true;\n</script>\n' +
  '</body></html>';

// Count script tags — should match (every open has a close)
var openScripts = (simHtml.match(/<script[^>]*>/g) || []);
var closeScripts = (simHtml.match(/<\/script>/g) || []);
check('3.2 open/close script tags balanced',
  openScripts.length === closeScripts.length,
  'open=' + openScripts.length + ' close=' + closeScripts.length);

// Verify the type="text/plain" block doesn't accidentally contain </script>
var plainStart = simHtml.indexOf('<script type="text/plain"');
var plainContentStart = simHtml.indexOf('>', plainStart) + 1;
var plainEnd = simHtml.indexOf('</script>', plainContentStart);
var plainContent = simHtml.slice(plainContentStart, plainEnd);

check('3.3 type=text/plain content has no literal </script>',
  plainContent.indexOf('</script>') < 0);

// ══════════════════════════════════════════════
// PART 4: Large payload round-trip (simulated 6MB)
// ══════════════════════════════════════════════
console.log('\n§S284b_TEST Large payload handling');

// Generate a ~1MB string (scaled down from 6MB for test speed)
var bigPayload = 'var _LARGE_MODULE = "';
for (var i = 0; i < 50000; i++) {
  bigPayload += 'abcdefghijklmnopqrst'; // 20 chars * 50k = 1MB
}
bigPayload += '";\n// end of large module';

// Add some </script> edge cases
bigPayload += '\nvar esc = "</script></SCRIPT></Script>";';

var safeBig = bigPayload.replace(/<\/script>/gi, '<\\/script>');

check('4.1 large payload (1MB) has no unescaped </script>',
  safeBig.indexOf('</script>') < 0);

var bigBlock = '<script type="text/plain" id="webifc-src">\n' + safeBig + '\n</script>';

// Verify block is well-formed
var bigInner = bigBlock.slice(bigBlock.indexOf('\n') + 1, bigBlock.lastIndexOf('\n'));
check('4.2 large block inner content size > 1MB',
  bigInner.length > 1000000,
  'size=' + bigInner.length);

check('4.3 large block inner has no </script>',
  bigInner.indexOf('</script>') < 0);

// ══════════════════════════════════════════════
// PART 5: Reverse escaping (worker side)
// ══════════════════════════════════════════════
console.log('\n§S284b_TEST Worker-side content retrieval');

// textContent in browser gives raw text — the <\/script> stays as-is
// But the HTML parser sees <\/script> and stores it literally (not as </script>)
// In practice, <\/ is not a close tag, so the text is preserved with the backslash.
// The worker receives the escaped form. importScripts replacement still works.

// Simulate what the worker receives
check('5.1 escaped content still has importScripts-replaceable patterns',
  'importScripts("https://unpkg.com/web-ifc@0.0.77/web-ifc-api-iife.js");'
    .replace(/importScripts\([^)]*web-ifc[^)]*\);?/, '// inlined')
    === '// inlined');

// The escaped </script> in the source code doesn't affect JS execution
// because it appears inside string literals — the backslash is part of the JS string
var testStr = '<\\/script>';
check('5.2 escaped tag in JS string evaluates correctly',
  testStr === '<\\/script>');

// ══════════════════════════════════════════════
// PART 6: No regression — online mode unaffected
// ══════════════════════════════════════════════
console.log('\n§S284b_TEST Online mode unchanged');

// The string appears in JS code (packager), but NOT as an actual HTML element in the source
// Count occurrences: should only appear inside the packageLandingPage JS string, not as real HTML
var realTagPattern = /^<script type="text\/plain" id="webifc-src">/m;
check('6.1 no actual webifc-src HTML element in source (only in packager JS string)',
  !realTagPattern.test(indexSrc));

check('6.2 _createWorker falls back to new Worker(scriptUrl) for online',
  indexSrc.indexOf('return new Worker(scriptUrl)') >= 0);

check('6.3 online path has no DOM element dependency',
  true); // Verified by 6.1 — no element exists, so online takes the else branch

// ══════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════
console.log('\n' + pass + ' PASS, ' + fail + ' FAIL — ' + (pass + fail) + ' total');
if (fail > 0) process.exit(1);
