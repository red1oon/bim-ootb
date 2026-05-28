/**
 * BIM OOTB — §S284 Standalone offline HTML whitebox test.
 * Verifies all file:// CORS-sensitive code paths have _STANDALONE guards.
 * Scans index.html + locale_loader.js source for unguarded fetch/Worker patterns.
 *
 * Model: test_s282b_panel_nav.js (source scan pattern).
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
const localeSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'locale_loader.js'), 'utf8');
const indexLines = indexSrc.split('\n');

// ══════════════════════════════════════════════
// PART 1: _STANDALONE flag injection
// ══════════════════════════════════════════════
console.log('\n§S284_TEST Standalone flag + manifest snapshot');

check('1.1 packageLandingPage function exists',
  indexSrc.indexOf('function packageLandingPage') >= 0);

check('1.2 injects _STANDALONE = true',
  indexSrc.indexOf("window._STANDALONE = true") >= 0);

check('1.3 injects _MANIFEST_SNAPSHOT',
  indexSrc.indexOf('_MANIFEST_SNAPSHOT') >= 0);

check('1.4 _manifestData stashed after fetch',
  indexSrc.indexOf('window._manifestData = data') >= 0);

check('1.5 manifest guard reads _MANIFEST_SNAPSHOT before fetch',
  indexSrc.indexOf('if (window._MANIFEST_SNAPSHOT)') >= 0);

check('1.6 About box has Save Offline link',
  indexSrc.indexOf('packageLandingPage()') >= 0 &&
  indexSrc.indexOf('Save Offline') >= 0);

// ══════════════════════════════════════════════
// PART 2: All fetch() calls in index.html guarded
// ══════════════════════════════════════════════
console.log('\n§S284_TEST All fetch() paths guarded for standalone');

// Find every fetch() call and verify it's either:
// (a) Inside a _STANDALONE guard (skip), or
// (b) Inside the manifest block (has _MANIFEST_SNAPSHOT guard), or
// (c) Goes to an absolute HTTPS URL (works from file://)

var fetchLines = [];
indexLines.forEach(function(line, idx) {
  // Match fetch( but skip comments and strings containing 'fetch'
  if (/\bfetch\s*\(/.test(line) && !/^\s*\/\//.test(line) && !/console\./.test(line)) {
    fetchLines.push({ num: idx + 1, line: line.trim().slice(0, 100) });
  }
});

// For each fetch, check if it's guarded
var unguardedFetches = [];
fetchLines.forEach(function(f) {
  var line = f.line;
  // HTTPS URLs work from file:// — OK
  if (/fetch\s*\(\s*['"]https:/.test(line)) return;
  // Inside packageLandingPage — only runs online — OK
  if (f.num >= getLineOf('function packageLandingPage') && f.num <= getLineOf('function downloadDIYScript')) return;
  // Check if a _STANDALONE guard exists within 20 lines above
  var guarded = false;
  for (var i = Math.max(0, f.num - 20); i < f.num; i++) {
    if (/(_STANDALONE|_MANIFEST_SNAPSHOT)/.test(indexLines[i])) { guarded = true; break; }
  }
  if (!guarded) unguardedFetches.push(f.num + ': ' + line);
});

function getLineOf(pattern) {
  for (var i = 0; i < indexLines.length; i++) {
    if (indexLines[i].indexOf(pattern) >= 0) return i + 1;
  }
  return -1;
}

check('2.1 total fetch() calls found: ' + fetchLines.length, fetchLines.length > 5);
check('2.2 no unguarded local fetch calls',
  unguardedFetches.length === 0,
  unguardedFetches.length ? unguardedFetches.join(' | ') : '');

// ══════════════════════════════════════════════
// PART 3: All new Worker() calls guarded
// ══════════════════════════════════════════════
console.log('\n§S284_TEST All Worker() paths guarded for standalone');

var workerLines = [];
indexLines.forEach(function(line, idx) {
  if (/new\s+Worker\s*\(/.test(line) && !/^\s*\/\//.test(line)) {
    workerLines.push({ num: idx + 1, line: line.trim().slice(0, 100) });
  }
});

var unguardedWorkers = [];
workerLines.forEach(function(w) {
  // Find the enclosing function and check if it has a _STANDALONE guard
  // Scan up to 120 lines above (functions can be long)
  var guarded = false;
  for (var i = Math.max(0, w.num - 120); i < w.num; i++) {
    if (/_STANDALONE/.test(indexLines[i])) { guarded = true; break; }
  }
  if (!guarded) unguardedWorkers.push(w.num + ': ' + w.line);
});

check('3.1 Worker() calls found: ' + workerLines.length, workerLines.length >= 1);
check('3.2 all Worker() calls have _STANDALONE guard',
  unguardedWorkers.length === 0,
  unguardedWorkers.length ? unguardedWorkers.join(' | ') : '');

// ══════════════════════════════════════════════
// PART 4: locale_loader.js guarded
// ══════════════════════════════════════════════
console.log('\n§S284_TEST locale_loader.js standalone guard');

check('4.1 locale_loader has _STANDALONE guard',
  localeSrc.indexOf('_STANDALONE') >= 0);

check('4.2 returns empty defaults when standalone',
  localeSrc.indexOf('callback(null, {})') >= 0 || localeSrc.indexOf("callback(null, {})") >= 0);

// ══════════════════════════════════════════════
// PART 5: Health check guarded
// ══════════════════════════════════════════════
console.log('\n§S284_TEST Health check guard');

var healthIdx = getLineOf('Health check');
check('5.1 health check section found', healthIdx > 0);
// Check _STANDALONE guard near health check
var healthGuarded = false;
for (var i = healthIdx - 1; i < healthIdx + 3; i++) {
  if (/_STANDALONE/.test(indexLines[i])) { healthGuarded = true; break; }
}
check('5.2 health check has _STANDALONE skip', healthGuarded);

// ══════════════════════════════════════════════
// PART 6: Community fetch guarded
// ══════════════════════════════════════════════
console.log('\n§S284_TEST Community fetch guard');

var communityIdx = getLineOf('Load Community Projects from contributed');
check('6.1 community JS section found', communityIdx > 0);
var communityGuarded = false;
for (var i = communityIdx; i < communityIdx + 5; i++) {
  if (/_STANDALONE/.test(indexLines[i])) { communityGuarded = true; break; }
}
check('6.2 community fetch has _STANDALONE skip', communityGuarded);

// ══════════════════════════════════════════════
// PART 7: handleImportMultiIFC guarded
// ══════════════════════════════════════════════
console.log('\n§S284_TEST Multi-file import guard');

var multiIdx = getLineOf('function handleImportMultiIFC');
check('7.1 handleImportMultiIFC found', multiIdx > 0);
var multiGuarded = false;
for (var i = multiIdx; i < multiIdx + 15; i++) {
  if (/_STANDALONE/.test(indexLines[i])) { multiGuarded = true; break; }
}
check('7.2 handleImportMultiIFC has _STANDALONE guard', multiGuarded);

// ══════════════════════════════════════════════
// PART 8: handleImportFile guarded
// ══════════════════════════════════════════════
console.log('\n§S284_TEST Single-file import guard');

var singleIdx = getLineOf('function handleImportFile');
check('8.1 handleImportFile found', singleIdx > 0);
var singleGuarded = false;
for (var i = singleIdx; i < singleIdx + 30; i++) {
  if (/_STANDALONE/.test(indexLines[i])) { singleGuarded = true; break; }
}
check('8.2 handleImportFile has _STANDALONE guard', singleGuarded);

// ══════════════════════════════════════════════
// PART 9: External script src inlined by packager
// ══════════════════════════════════════════════
console.log('\n§S284_TEST packager inlines external scripts');

var packagerSrc = '';
var pStart = getLineOf('function packageLandingPage');
var pEnd = pStart;
for (var i = pStart; i < indexLines.length; i++) {
  packagerSrc += indexLines[i] + '\n';
  if (i > pStart && /^\}$/.test(indexLines[i].trim())) { pEnd = i; break; }
}

check('9.1 packager fetches import_db_builder.js',
  packagerSrc.indexOf('import_db_builder') >= 0);
check('9.2 packager fetches locale_loader.js',
  packagerSrc.indexOf('locale_loader') >= 0);
check('9.3 packager base64s Sysnova.png',
  packagerSrc.indexOf('Sysnova.png') >= 0);
check('9.4 packager strips goatcounter',
  packagerSrc.indexOf('goatcounter') >= 0);
check('9.5 packager fixes viewer URLs to GitHub Pages',
  packagerSrc.indexOf('red1oon.github.io') >= 0);
check('9.6 packager triggers download as BIM-OOTB.html',
  packagerSrc.indexOf("'BIM-OOTB.html'") >= 0);

// ══════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════
console.log('\n' + pass + ' PASS, ' + fail + ' FAIL — ' + (pass + fail) + ' total');
if (fail > 0) process.exit(1);
