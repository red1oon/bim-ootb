// witness_tm_duration_sync.js — §TM_DURATION_SYNC
//
// ROOT CAUSE (see prompts/GANTT_ACCURACY.md + commit d35366a "§LABOR_QUANTITY_WEIGHT — real cause
// fixed"): schedule_author.js's _installSecs/_classFragmentation already detect Terminal's 33,324
// "Metal Deck" IfcPlate fragments (avg 0.074 m² each — smaller than a floor tile) and weight their
// labor-seconds by REAL AREA instead of once-per-fragment, bringing Superstructure from 968d to
// 111d. time_machine.js's getInstallSecs (feeds schedule_gate.js place()'s installSecs*scaleFactor
// — the REAL-TIME PLAYBACK clock) was a hand-duplicated copy of the OLD, un-weighted formula, so
// the WBS/Gantt dates were fixed but the Time Machine scrub/playback clock still raced through
// Superstructure. Fixed by wiring getInstallSecs to call window.ScheduleAuthor._installSecs (now
// exported) with the same realQty area-weight ScheduleAuthor._classFragmentation computes — single
// source of truth, no second copy.
//
// PROOF METHOD (non-invent):
//  BEFORE — the pre-fix getInstallSecs/matchRule/matchNameOverride source, extracted VERBATIM via
//    `git show <base-commit>:viewer/time_machine.js` (not hand-retyped), eval'd and run for real
//    against Terminal's real IfcPlate rows.
//  AFTER  — the CURRENTLY SHIPPED code path: time_machine.js's getInstallSecs(cls, rule, guid) is
//    now a direct proxy to window.ScheduleAuthor._installSecs(cls, rule, LR, realQty); this witness
//    calls that exact real, shipped function (require('../schedule_author.js')) with the same
//    realQty ScheduleAuthor._classFragmentation computes on the real DB — proving the wiring, not a
//    reimplementation of it.
//
// DB: deploy/buildings/Terminal_extracted.db (bim-compiler) — SAME db witness_phase_duration.js
// used to prove the 111-day Superstructure figure this witness's AFTER numbers must be consistent
// with (48,428 elements).

var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');

var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var VIEWER = path.join(__dirname, '..', '..', 'viewer');
var DB_PATH = '/home/red1/bim-compiler/deploy/buildings/Terminal_extracted.db';
var BASE_COMMIT = '8592b33';   // tip of origin/main before this session's fix — the PRE-FIX blob

var ScheduleAuthor = require(path.join(VIEWER, 'schedule_author.js'));   // the real, currently-shipped module

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-TMSYNC PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-TMSYNC FAIL  ' + name + (detail ? '  ' + detail : '')); }
}

// Extract lines [startLine, endLine] (1-indexed, inclusive) of viewer/time_machine.js AS IT SHIPPED
// at BASE_COMMIT, via `git show` — not hand-transcribed, so the "BEFORE" formula below is
// byte-verified to be exactly what was live before this session's fix.
function gitShowLines(commit, relPath, startLine, endLine) {
  var full = cp.execSync('git show ' + commit + ':' + relPath, { cwd: __dirname, maxBuffer: 1024 * 1024 * 64 }).toString('utf8');
  var lines = full.split('\n');
  return lines.slice(startLine - 1, endLine).join('\n');
}

(async function () {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } });

  // ── Load rates.js globals (RATES / LABOR_RATES / SEQUENCE_RULES / SEQUENCE_DEFAULT /
  //    SEQUENCE_NAME_OVERRIDES) verbatim, same slice-and-eval technique witness_phase_duration.js
  //    uses, widened to also pull RATES + SEQUENCE_NAME_OVERRIDES. ──
  var ratesTxt = fs.readFileSync(path.join(VIEWER, 'rates.js'), 'utf8');
  var globals = (function () {
    // eslint-disable-next-line no-new-func
    return (new Function(ratesTxt +
      '\n return { RATES: RATES, LABOR_RATES: LABOR_RATES, SEQUENCE_RULES: SEQUENCE_RULES, ' +
      'SEQUENCE_DEFAULT: SEQUENCE_DEFAULT, SEQUENCE_NAME_OVERRIDES: (typeof SEQUENCE_NAME_OVERRIDES !== "undefined" ? SEQUENCE_NAME_OVERRIDES : []) };'))();
  })();
  console.log('§W-TMSYNC RATES-LOADED RATES=' + Object.keys(globals.RATES).length +
    ' LABOR_RATES=' + Object.keys(globals.LABOR_RATES).length +
    ' SEQUENCE_RULES=' + Object.keys(globals.SEQUENCE_RULES).length);

  var dbBytes = fs.readFileSync(DB_PATH);
  var db = new SQL.Database(new Uint8Array(dbBytes));
  var nElems = db.exec('SELECT COUNT(*) FROM elements_meta')[0].values[0][0];
  console.log('§W-TMSYNC DB-LOADED elements=' + nElems + ' path=' + DB_PATH);

  // ── The REAL fragmentation detection (schedule_author.js, unchanged by this fix) — identifies
  //    which M2-priced class(es) are over-fragmented on THIS building and each element's real area.
  var _frag = ScheduleAuthor._classFragmentation(db, globals.RATES);
  var fragClasses = Object.keys(_frag.fragmented);
  check('fragmentation-detected-at-least-one-class', fragClasses.length > 0, 'classes=[' + fragClasses.join(',') + ']');
  var targetCls = fragClasses.indexOf('IfcPlate') >= 0 ? 'IfcPlate' : fragClasses[0];
  console.log('§W-TMSYNC TARGET_CLASS=' + targetCls + ' avgArea=' + (_frag.fragmented[targetCls] ? _frag.fragmented[targetCls].avg.toFixed(4) : 'n/a') + 'm2 count=' + (_frag.fragmented[targetCls] ? _frag.fragmented[targetCls].count : 0));

  // Real elements of the fragmented class + their real name (for matchNameOverride, same as production).
  var er = db.exec("SELECT guid, ifc_class, COALESCE(element_name,'') FROM elements_meta WHERE ifc_class=?", [targetCls]);
  var rows = (er.length && er[0].values.length) ? er[0].values : [];
  check('target-class-has-real-elements', rows.length > 0, 'count=' + rows.length);

  // ══════════════════════════ BEFORE — pre-fix time_machine.js, verbatim ══════════════════════════
  // Lines 3449-3488 of viewer/time_machine.js AT BASE_COMMIT: matchNameOverride/matchRule/
  // getInstallSecs — the OLD hand-duplicated copy with NO fragmentation/area-weighting. Extracted via
  // `git show`, not retyped, then eval'd in a sandbox that supplies the SAME upvalues (SR/LR/SD/NO)
  // the real closure had, and run against Terminal's real rows.
  var beforeSrc = gitShowLines(BASE_COMMIT, 'viewer/time_machine.js', 3449, 3488);
  console.log('§W-TMSYNC BEFORE_SRC_FIRST_LINE=' + beforeSrc.split('\n')[0].trim());
  check('before-src-is-the-unfixed-formula', /Math\.round\(28800 \/ prod\)/.test(beforeSrc) && !/realQty/.test(beforeSrc),
    'no realQty/area term present (confirms pre-fix)');

  function buildBeforeFn(seqRules, laborRates, seqDefault, nameOverrides) {
    // The extracted source reads window.SEQUENCE_RULES/LABOR_RATES/SEQUENCE_DEFAULT/
    // SEQUENCE_NAME_OVERRIDES directly (exactly as it did in the browser) — supply a real `window`.
    var window = { SEQUENCE_RULES: seqRules, LABOR_RATES: laborRates, SEQUENCE_DEFAULT: seqDefault, SEQUENCE_NAME_OVERRIDES: nameOverrides };
    // eslint-disable-next-line no-eval
    eval(beforeSrc);
    // eslint-disable-next-line no-undef
    return getInstallSecs;
  }
  var beforeGetInstallSecs = buildBeforeFn(globals.SEQUENCE_RULES, globals.LABOR_RATES, globals.SEQUENCE_DEFAULT, globals.SEQUENCE_NAME_OVERRIDES);

  // ══════════════════════════ AFTER — currently shipped, real function ══════════════════════════
  // time_machine.js's getInstallSecs(cls, rule, guid) is now (viewer/time_machine.js, post-fix):
  //   var realQty = (_frag.fragmented[cls] && guid != null && _frag.area[guid] != null) ? _frag.area[guid] : null;
  //   return window.ScheduleAuthor._installSecs(cls, rule, LR, realQty);
  // — i.e. a direct proxy. This calls that exact real, shipped ScheduleAuthor function with the
  // same realQty derivation, so the numbers below ARE what the fixed getInstallSecs now returns.
  function afterGetInstallSecs(cls, rule, guid) {
    var realQty = (_frag.fragmented[cls] && guid != null && _frag.area[guid] != null) ? _frag.area[guid] : null;
    return ScheduleAuthor._installSecs(cls, rule, globals.LABOR_RATES, realQty);
  }

  // ── Run both over every real element of the fragmented class ──
  var beforeTotal = 0, afterTotal = 0, sampleLogged = 0;
  var beforePerElem = null;   // the old formula is constant per class (no area term) — verify that too
  var beforeVaries = false;
  rows.forEach(function (row) {
    var guid = row[0], cls = row[1];
    var rule = ScheduleAuthor.matchRule(cls, globals.SEQUENCE_RULES, globals.SEQUENCE_DEFAULT);
    var b = beforeGetInstallSecs(cls);          // old signature: cls only, re-derives its own rule internally
    var a = afterGetInstallSecs(cls, rule, guid);
    if (beforePerElem == null) beforePerElem = b; else if (b !== beforePerElem) beforeVaries = true;
    beforeTotal += b; afterTotal += a;
    if (sampleLogged < 3) {
      console.log('§W-TMSYNC SAMPLE guid=' + guid + ' cls=' + cls + ' realArea=' + (_frag.area[guid] != null ? _frag.area[guid].toFixed(4) : 'n/a') +
        'm2 beforeSecs=' + b + ' afterSecs=' + a);
      sampleLogged++;
    }
  });
  console.log('§W-TMSYNC ' + targetCls + ' n=' + rows.length + ' beforeTotalSecs=' + beforeTotal + ' afterTotalSecs=' + afterTotal +
    ' ratio(before/after)=' + (afterTotal > 0 ? (beforeTotal / afterTotal).toFixed(2) : 'inf'));

  check('before-formula-is-per-fragment-constant-no-area-weight', !beforeVaries,
    'every ' + targetCls + ' fragment got the SAME installSecs=' + beforePerElem + 's regardless of its real area (pre-fix bug, reproduced)');
  check('after-formula-varies-with-real-area', afterTotal < beforeTotal,
    'afterTotal=' + afterTotal + 's < beforeTotal=' + beforeTotal + 's (area-weighting now active)');

  // ── Extra rigor: don't just trust that afterGetInstallSecs is "logically equivalent" to the real
  //    post-fix time_machine.js — extract the ACTUAL post-fix `_frag`/getInstallSecs source (current
  //    file on disk, the one about to be committed) and eval+run THAT, in a sandbox providing the
  //    same `db`/`window`/`LR` upvalues the real injectGantt() closure has, and confirm it produces
  //    the IDENTICAL numbers to afterGetInstallSecs above (same function, same inputs, same output —
  //    proving the wiring is real, not just plausible-looking). ──
  var tmSrc = fs.readFileSync(path.join(VIEWER, 'time_machine.js'), 'utf8');
  var tmLines = tmSrc.split('\n');
  var afterSrcStart = tmLines.findIndex(function (l) { return /var _frag = \(function \(\) \{/.test(l); }) + 1;
  var afterSrcEnd = tmLines.findIndex(function (l) { return /^    function getInstallSecs\(/.test(l); });
  // walk forward from the function line to find its closing brace at 4-space indent
  var depth = 0, endLine = -1;
  for (var li = afterSrcEnd; li < tmLines.length; li++) {
    var opens = (tmLines[li].match(/\{/g) || []).length, closes = (tmLines[li].match(/\}/g) || []).length;
    depth += opens - closes;
    if (li > afterSrcEnd && depth <= 0) { endLine = li; break; }
  }
  check('located-post-fix-frag-and-getInstallSecs-block', afterSrcStart > 0 && endLine > afterSrcStart,
    'lines ' + afterSrcStart + '-' + (endLine + 1) + ' of viewer/time_machine.js (as edited)');
  var postFixSrc = tmLines.slice(afterSrcStart - 1, endLine + 1).join('\n');

  function buildRealAfterFn(realDb, realScheduleAuthor, realRates, realLaborRates) {
    var window = { ScheduleAuthor: realScheduleAuthor, RATES: realRates };
    var db = realDb;
    var LR = realLaborRates;
    // eslint-disable-next-line no-eval
    eval(postFixSrc);
    // eslint-disable-next-line no-undef
    return getInstallSecs;
  }
  var realAfterGetInstallSecs = buildRealAfterFn(db, ScheduleAuthor, globals.RATES, globals.LABOR_RATES);

  var realAfterTotal = 0, mismatch = 0;
  rows.forEach(function (row) {
    var guid = row[0], cls = row[1];
    var rule = ScheduleAuthor.matchRule(cls, globals.SEQUENCE_RULES, globals.SEQUENCE_DEFAULT);
    var a2 = realAfterGetInstallSecs(cls, rule, guid);
    realAfterTotal += a2;
  });
  check('real-post-fix-source-matches-proxy-computation', realAfterTotal === afterTotal,
    'realAfterTotalSecs=' + realAfterTotal + ' afterTotalSecs=' + afterTotal + ' (extracted-and-run post-fix source reproduces the same numbers)');

  // Convert to elapsed CREW-DAYS the same way schedule_author.js's §PHASE_DURATION does (bottleneck
  // trade / max_crews) so the magnitude is comparable to the already-proven 111d Superstructure figure.
  var resource = (ScheduleAuthor.matchRule(targetCls, globals.SEQUENCE_RULES, globals.SEQUENCE_DEFAULT) || {}).resource;
  var maxCrews = (resource && globals.LABOR_RATES[resource] && globals.LABOR_RATES[resource].max_crews) || 1;
  var beforeDays = Math.ceil(beforeTotal / (28800 * maxCrews));
  var afterDays = Math.ceil(afterTotal / (28800 * maxCrews));
  console.log('§W-TMSYNC ' + targetCls + ' resource=' + resource + ' maxCrews=' + maxCrews +
    ' beforeDays=' + beforeDays + ' afterDays=' + afterDays + ' ratio=' + (beforeDays / afterDays).toFixed(2) + 'x');

  // G1: magnitude direction + rough order of the already-proven 968d->111d (~8.7x) Superstructure fix.
  check('ratio-consistent-with-proven-968d-to-111d-fix', (beforeDays / afterDays) > 3,
    'measured ' + (beforeDays / afterDays).toFixed(2) + 'x (proven WBS-path ratio was ~8.72x, 968d/111d)');

  console.log('§W-TMSYNC SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('§W-TMSYNC ERROR', e); process.exit(1); });
