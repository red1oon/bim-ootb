/**
 * test_import_worker_safety.js — §S274 CloseModel removal verification
 * Issue: CloseModel() hits 4GB WASM ceiling on large IFC files (48K+ elements),
 *        sending a spurious error message after the result is already posted.
 * Fix:   Removed CloseModel(). Worker.terminate() from main thread reclaims all memory.
 *
 * This test reads the source code and verifies the fix is in place.
 * Two buildings: TerminalMerged (567MB, 48K elements) and Clinic (3KB, small).
 */

const fs = require('fs');
const path = require('path');

var pass = 0, fail = 0;

function assert(cond, tag, msg) {
  if (cond) { pass++; console.log('  §IMPORT_SAFETY PASS ' + tag + ': ' + msg); }
  else { fail++; console.log('  §IMPORT_SAFETY FAIL ' + tag + ': ' + msg); }
}

// ── Test 1: import_worker.js does NOT call CloseModel after postMessage ──
const workerSrc = fs.readFileSync(path.resolve(__dirname, '..', 'viewer', 'import_worker.js'), 'utf8');

// Find the postMessage(result, transferables) line
var postIdx = workerSrc.indexOf('self.postMessage(result, transferables)');
assert(postIdx > 0, 'T1', 'postMessage(result, transferables) found in source');

// Everything after postMessage until the catch block
var afterPost = workerSrc.substring(postIdx);
var catchIdx = afterPost.indexOf('} catch(err)');
var betweenPostAndCatch = afterPost.substring(0, catchIdx);

// CloseModel must NOT appear as executable code between postMessage and catch
// Strip comments before checking — the explanatory comment mentions CloseModel by name
var strippedCode = betweenPostAndCatch.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
var hasCloseModelCall = /ifcApi\.CloseModel\s*\(/.test(strippedCode);
assert(!hasCloseModelCall, 'T2', 'No ifcApi.CloseModel() call after postMessage — OOM cannot send spurious error');

// The comment explaining why should be present
var hasOomComment = betweenPostAndCatch.indexOf('WASM') > -1 || betweenPostAndCatch.indexOf('OOM') > -1;
assert(hasOomComment, 'T3', 'Comment documents WASM/OOM reason for skipping CloseModel');

// ── Test 2: import.js main thread calls worker.terminate() after done ──
const importSrc = fs.readFileSync(path.resolve(__dirname, '..', 'viewer', 'import.js'), 'utf8');

// Primary import path (line ~207)
var doneBlock = importSrc.match(/if\s*\(\s*msg\.type\s*===\s*'done'\s*\)[\s\S]*?worker\.terminate\(\)/);
assert(!!doneBlock, 'T4', 'Primary import path: worker.terminate() called after done message');

// Secondary import path (_parseOneIFC, line ~351)
var parseOneBlock = importSrc.match(/function _parseOneIFC[\s\S]*?worker\.terminate\(\)/);
assert(!!parseOneBlock, 'T5', 'Secondary import path (_parseOneIFC): worker.terminate() called after done');

// ── Test 3: error path still works (catch block sends error message) ──
var catchBlock = afterPost.substring(catchIdx, catchIdx + 300);
var sendsError = /self\.postMessage\(\s*\{\s*type:\s*'error'/.test(catchBlock);
assert(sendsError, 'T6', 'Catch block still sends error message for real import failures');

// ── Test 4: No double-message race — verify CloseModel is not in ANY try block after postMessage ──
var tryAfterPost = betweenPostAndCatch.match(/try\s*\{[\s\S]*?CloseModel/);
assert(!tryAfterPost, 'T7', 'No try{CloseModel} pattern after postMessage — no race condition possible');

// ── Test 5: Verify large IFC files exist for manual testing (skip in CI) ──
var isCI = !!process.env.CI || !!process.env.GITHUB_ACTIONS;
if (!isCI) {
  var terminalExists = fs.existsSync(path.resolve(process.env.HOME, 'Downloads', 'TerminalMerged.ifc'));
  var clinicExists = fs.existsSync(path.resolve(process.env.HOME, 'Downloads', 'Clinic.ifc'));
  assert(terminalExists, 'T8', 'TerminalMerged.ifc (567MB, 48K elements) available for manual browser test');
  assert(clinicExists, 'T9', 'Clinic.ifc (3KB, small) available for manual browser test');
} else {
  console.log('  §IMPORT_SAFETY SKIP T8/T9: large IFC files not available in CI');
}

// ── Summary ──
console.log('\n§IMPORT_SAFETY_SUMMARY ' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' total');
if (fail > 0) process.exit(1);
