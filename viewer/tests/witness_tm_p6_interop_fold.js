#!/usr/bin/env node
// WITNESS — W-FOLD — §TM_P6_FOLD: the Schedule Editor tab is retired; P6/MSP interop lives in the TM panel
// Spec: the 2026-08-24 fold decision — the Editor tab's editing surface (WBS outline, dependency
// editor, drag-Gantt, ▶ CPM, zoom) was fully redundant with the TM drawer's direct editing
// (§GANTT_EDIT/§GANTT_PROPS, PRs #1498/#1500) + auto-CPM-annotate (§S68); its ONE non-redundant
// surface (P6/MSPDI import, MSPDI/PMXML/XER export, §4D_SCHEDULE_DIFF) folds INTO the TM panel,
// lazy-loaded, operating on the TM's own app.db.
//
// ISSUE EACH CHECK PROVES OR DISPROVES:
//   W-FOLD-1  the section EXISTS and is COLLAPSED BY DEFAULT — a section that ships open would
//             crowd the 376px panel for every user; one that doesn't exist means the interop
//             feature was dropped with the tab (the exact regression this fold must not cause).
//   W-FOLD-2  the interop engines are LAZY, not eager — foreign_schedule.js/schedule_diff.js in
//             the main viewer's eager <script> list would make every viewer boot pay for a feature
//             most sessions never open. The ONLY loader is _tmLoadP6Modules, and opening the
//             section calls it.
//   W-FOLD-3  the OLD surface is really gone — no window.open of the editor page, the two files
//             deleted, sw.js no longer precaching them (a precache of a deleted file breaks SW
//             install), while foreign_schedule/schedule_diff STAY precached so the lazy load
//             works offline.
//   W-FOLD-4  the ported IMPORT operates on app.db — real ForeignSchedule engine, real sql.js db,
//             real XER fixture through the REAL tmImportForeign body: the adopted schedule's rows
//             land in the SAME db object A() returned, and the full post-edit pipeline runs
//             (invalidate → annotate(§S68) → persist(§S70) → refold(§TM-REFOLD)).
//   W-FOLD-5  the ported EXPORTS read the same db back out — tmExportMSProject/_tmExportP6 feed
//             the real serializers from app.db, and the output ROUND-TRIPS through our own real
//             readers with the imported task/link counts intact (a wiring slip — wrong db, wrong
//             schedId — shows up as a count mismatch here).
//   W-FOLD-6  the ported DIFF guards + wires correctly — refuses on a non-captured schedule
//             (diffing our own estimate against itself is a no-op), and on a captured one hands
//             ScheduleDiff.computeScheduleDiff the TM's app.db + the imported schedule id.
//
// ⚠ Brace-matched extraction, never a fixed slice window (§S65 G-COH-6 false-negative class).
// Command: node viewer/tests/witness_tm_p6_interop_fold.js     (no browser, no building fixture)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.js'));

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

const V = f => path.join(__dirname, '..', f);
const src = fs.readFileSync(V('time_machine.js'), 'utf8');
const html = fs.readFileSync(V('viewer.html'), 'utf8');
const sw = fs.readFileSync(V('sw.js'), 'utf8');

function namedFns(text) {
  const out = [];
  const re = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(text))) {
    const open = text.indexOf('{', m.index);
    if (open < 0) continue;
    let depth = 0, end = -1;
    for (let i = open; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end > 0) out.push({ name: m[1], start: m.index, end: end, body: text.slice(m.index, end) });
  }
  return out;
}
const FNS = namedFns(src);
const fn = n => FNS.find(f => f.name === n);

console.log('── witness_tm_p6_interop_fold (§TM_P6_FOLD) ──');

// ── W-FOLD-1: the section exists, collapsed by default, with all its controls ───────────────────
assert(/id="tm-p6-box" class="tm-drawer-bottom"/.test(src),
  'W-FOLD-1a #tm-p6-box exists with class tm-drawer-bottom and NOTHING else — no "open" at build time');
assert(/\.tm-drawer-bottom\{max-height:0/.test(src),
  'W-FOLD-1b the drawer CSS contract (.tm-drawer-bottom max-height:0) still collapses it by default');
['tm-p6-import', 'tm-p6-file', 'tm-p6-autobind', 'tm-p6-export-msp', 'tm-p6-export-pmxml',
 'tm-p6-export-xer', 'tm-p6-diff', 'tm-p6-out'].forEach(id => {
  assert(src.indexOf('id="' + id + '"') >= 0, 'W-FOLD-1c control #' + id + ' present in the panel markup');
});
assert(/id="tm-p6-autobind" type="checkbox" checked/.test(src),
  'W-FOLD-1d the §B3 auto-bind opt-in still defaults ON (same contract the old tab shipped)');
const wireFn = fn('wireP6Controls');
assert(!!wireFn && ['tmImportForeign', 'tmExportMSProject', 'tmExportPMXML', 'tmExportXER', 'tmDiffVsModel']
  .every(c => wireFn.body.indexOf(c) >= 0),
  'W-FOLD-1e wireP6Controls wires ALL five actions — a button nothing listens to is not the feature');

// ── W-FOLD-2: lazy, not eager ───────────────────────────────────────────────────────────────────
const eagerRe = /<script[^>]*(foreign_schedule\.js|schedule_diff\.js)/;
assert(!eagerRe.test(html),
  'W-FOLD-2a viewer.html has NO eager <script> tag for foreign_schedule.js/schedule_diff.js');
assert(eagerRe.test('<script src="foreign_schedule.js?v=1"></script>'),
  'W-FOLD-2b RED CONTROL: the eager-scan regex WOULD flag a planted tag — otherwise 2a gates nothing');
const loaderFn = fn('_tmLoadP6Modules');
assert(!!loaderFn, 'W-FOLD-2c _tmLoadP6Modules is a real brace-matched function in time_machine.js');
// A LOADABLE reference is the filename as a string LITERAL (what a <script src> injection needs);
// prose comments naming the file are not load paths and must not trip this gate.
['foreign_schedule.js', 'schedule_diff.js'].forEach(name => {
  const outside = [];
  const litRe = new RegExp('[\'"]' + name.replace('.', '\\.'), 'g');
  let mm;
  while ((mm = litRe.exec(src))) {
    if (!loaderFn || mm.index < loaderFn.start || mm.index > loaderFn.end) outside.push(mm.index);
  }
  assert(outside.length === 0,
    'W-FOLD-2d every \'' + name + '\' STRING LITERAL in time_machine.js is INSIDE _tmLoadP6Modules (outside=' + outside.length + ') — no second load path to drift');
});
const togFn = fn('toggleP6Drawer');
assert(!!togFn && togFn.body.indexOf('_tmLoadP6Modules(') >= 0,
  'W-FOLD-2e opening the section calls the lazy loader — lazy-load that nothing triggers is a dead feature');
assert(/'tm-editor'\)[\s\S]{0,300}toggleP6Drawer\(\)/.test(src),
  'W-FOLD-2f #tm-editor is wired to toggleP6Drawer — the repurposed button actually opens the section');

// ── W-FOLD-3: the old surface is gone ───────────────────────────────────────────────────────────
assert(!/window\.open\([^)]*schedule_editor/.test(src),
  'W-FOLD-3a time_machine.js no longer window.open()s the editor page (the old #tm-editor behavior)');
assert(!fs.existsSync(V('schedule_editor.html')) && !fs.existsSync(V('schedule_editor_ui.js')),
  'W-FOLD-3b schedule_editor.html + schedule_editor_ui.js are deleted from viewer/');
assert(!/'schedule_editor\.html'|'schedule_editor_ui\.js'/.test(sw),
  'W-FOLD-3c sw.js no longer precaches the deleted files — precaching a 404 breaks SW install');
assert(/'foreign_schedule\.js'/.test(sw) && /'schedule_diff\.js'/.test(sw),
  'W-FOLD-3d foreign_schedule.js + schedule_diff.js STAY precached — the lazy load must work offline');
assert(!/schedule_editor/.test(html),
  'W-FOLD-3e viewer.html carries no reference to the deleted page');

// ── W-FOLD-4/5/6: behaviour — real engines, real fixture, the REAL ported function bodies ───────
const FSx = require(V('foreign_schedule.js'));
const SA = require(V('schedule_author.js'));
const FIXTURE = path.join(__dirname, '..', '..', 'tests', 'fixtures', 'Hospital_GW_Programme.xer');
const xerText = fs.readFileSync(FIXTURE, 'utf8');

const NAMES = ['tmImportForeign', 'tmExportMSProject', '_tmExportP6', 'tmExportPMXML', 'tmExportXER',
  'tmDiffVsModel', '_p6DaysBetween', '_tmP6BaseName'];
const extracted = NAMES.map(n => { const f = fn(n); assert(!!f, 'W-FOLD-4a ' + n + ' is a real brace-matched function in time_machine.js'); return f; });
if (extracted.some(f => !f)) { console.log('§TM_P6_FOLD_SUMMARY pass=' + pass + ' fail=' + fail); process.exit(1); }
const SLICE = extracted.map(f => f.body).join('\n');

initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.wasm')) }).then(function (SQL) {
  const db = new SQL.Database();
  const calls = { invalidate: 0, annotate: [], persist: [], refold: 0, locked: 0, say: [], downloads: [] };
  const logs = [];
  const diffCapture = [];
  function makeSandbox(appObj, schedIdFn, diffStub, saOverride) {
    const sandbox = {
      console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push('ERR ' + a.join(' ')), warn: () => {} },
      window: { ForeignSchedule: FSx, ScheduleAuthor: saOverride || SA, ScheduleDiff: diffStub || { computeScheduleDiff: (d, f, o) => { diffCapture.push({ db: d, foreign: f, opts: o }); return { error: 'stub' }; } } },
      A: () => appObj,
      document: { getElementById: () => null },
      FileReader: function () {
        this.onload = null;
        this.readAsText = function (file) { this.result = file.__content; if (this.onload) this.onload(); };
      },
      setTimeout: (cb) => cb(),   // synchronous — deterministic, no async race in a witness
      _tmEditLocked: () => { return false; },
      _tmP6Say: (m) => calls.say.push(m),
      _tmSay: (m) => calls.say.push(m),
      _tmP6Download: (content, mime, fname) => calls.downloads.push({ content, mime, fname }),
      _tmP6SchedId: schedIdFn,
      invalidateGanttModel: () => calls.invalidate++,
      _tmAnnotateCpm: (sid) => calls.annotate.push(sid),
      _tmPersistEdit: (what) => calls.persist.push(what),
      refoldSchedule: () => calls.refold++,
    };
    sandbox.window.window = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(SLICE + '\nthis.__fns = { tmImportForeign, tmExportMSProject, tmExportPMXML, tmExportXER, tmDiffVsModel };', sandbox);
    return sandbox;
  }

  // ── W-FOLD-4: import through the REAL body, into the db A() returns ──
  const app = { db: db, DB_URL: 'buildings/SampleHouse_extracted.db' };
  let importedSchedId = null;
  const sb = makeSandbox(app, () => importedSchedId || 'SCH_AUTHORED');
  sb.__fns.tmImportForeign({ name: 'Hospital_GW_Programme.xer', __content: xerText });
  const importLog = logs.find(l => l.indexOf('§TM_IMPORT_P6 ') === 0) || '';
  const mSched = importLog.match(/schedule=(\S+)/);
  importedSchedId = mSched ? mSched[1] : null;
  assert(/format=XER/.test(importLog) && !!importedSchedId,
    'W-FOLD-4b §TM_IMPORT_P6 logged with format=XER and a schedule id (' + importLog.slice(0, 90) + ')');
  const nTasks = db.exec('SELECT COUNT(*) FROM tasks WHERE schedule_id=?', [importedSchedId]);
  const nLeaf = db.exec('SELECT COUNT(*) FROM tasks WHERE schedule_id=? AND (is_summary IS NULL OR is_summary=0)', [importedSchedId]);
  const nLinks = db.exec('SELECT COUNT(*) FROM task_sequences');
  const leafCount = nLeaf[0].values[0][0], linkCount = nLinks[0].values[0][0];
  console.log('§TM_P6_FOLD_IMPORT schedule=' + importedSchedId + ' tasks=' + nTasks[0].values[0][0] +
    ' leaves=' + leafCount + ' links=' + linkCount);
  assert(nTasks[0].values[0][0] > 0 && leafCount === 14,
    'W-FOLD-4c the adopted rows are IN the db A() returned — 14 leaf activities (fixture ground truth), got ' + leafCount);
  assert(calls.invalidate >= 1 && calls.annotate.length === 1 && calls.annotate[0] === importedSchedId &&
    calls.persist.indexOf('import_p6') >= 0 && calls.refold === 1,
    'W-FOLD-4d the FULL post-edit pipeline ran: invalidate=' + calls.invalidate + ' annotate(' + calls.annotate.join(',') +
    ') persist=[' + calls.persist.join(',') + '] refold=' + calls.refold +
    ' — a missing step is the §S67/§S70 class (stale canvas / unpersisted edit), not a style nit');
  assert(calls.say.some(m => /Imported XER/.test(m) && /14 activities/.test(m)),
    'W-FOLD-4e the user-visible status reports the import (routed through the TM tip/output, not the dead #se-status)');

  // ── W-FOLD-5: exports read the same db back out, and round-trip through our own readers ──
  calls.downloads.length = 0;
  sb.__fns.tmExportMSProject();
  const msp = calls.downloads[calls.downloads.length - 1];
  assert(!!msp && /_schedule\.xml$/.test(msp.fname) && msp.mime === 'application/xml',
    'W-FOLD-5a tmExportMSProject produced an MSPDI download (' + (msp && msp.fname) + ')');
  const mspBack = FSx.toScheduleData(FSx.parseMSPDI(msp.content));
  assert(mspBack._meta.leafCount === leafCount && mspBack.taskSequences.length === linkCount,
    'W-FOLD-5b MSPDI ROUND-TRIP through our own parseMSPDI: leaves ' + mspBack._meta.leafCount + '/' + leafCount +
    ', links ' + mspBack.taskSequences.length + '/' + linkCount + ' — wrong db or schedId would break these counts');
  sb.__fns.tmExportPMXML();
  const pmx = calls.downloads[calls.downloads.length - 1];
  const pmxBack = FSx.toScheduleData(FSx.parseForeign(pmx.content, pmx.fname).parsed);
  assert(pmxBack._meta.leafCount === leafCount && pmxBack.taskSequences.length === linkCount,
    'W-FOLD-5c PMXML round-trip: leaves ' + pmxBack._meta.leafCount + '/' + leafCount + ', links ' + pmxBack.taskSequences.length + '/' + linkCount);
  sb.__fns.tmExportXER();
  const xer = calls.downloads[calls.downloads.length - 1];
  const xerBack = FSx.toScheduleData(FSx.parseForeign(xer.content, xer.fname).parsed);
  assert(xerBack._meta.leafCount === leafCount && xerBack.taskSequences.length === linkCount,
    'W-FOLD-5d XER round-trip: leaves ' + xerBack._meta.leafCount + '/' + leafCount + ', links ' + xerBack.taskSequences.length + '/' + linkCount);

  // ── W-FOLD-6: diff guard + wiring ──
  // (i) non-captured schedule → refuse, never call the engine.
  diffCapture.length = 0; calls.say.length = 0;
  const sbUncap = makeSandbox(app, () => importedSchedId, null,
    { activeSchedule: () => ({ id: 'SCH_AUTHORED', captured: 0 }) });
  sbUncap.__fns.tmDiffVsModel();
  assert(diffCapture.length === 0 && calls.say.some(m => /import one first/.test(m)),
    'W-FOLD-6a non-captured schedule: diff REFUSES with guidance and never calls the engine (calls=' + diffCapture.length + ')');
  // (ii) captured schedule → the engine gets app.db + the imported schedule id.
  diffCapture.length = 0;
  const sbCap = makeSandbox(app, () => importedSchedId, null,
    { activeSchedule: () => ({ id: importedSchedId, captured: 1 }) });
  sbCap.__fns.tmDiffVsModel();
  assert(diffCapture.length === 1 && diffCapture[0].db === db && diffCapture[0].foreign === null &&
    diffCapture[0].opts.importedScheduleId === importedSchedId,
    'W-FOLD-6b captured schedule: computeScheduleDiff receives app.db ITSELF (not a copy), foreignData=null, importedScheduleId=' +
    (diffCapture[0] && diffCapture[0].opts.importedScheduleId) + ' — the exact contract schedule_diff.js documents');

  console.log('§TM_P6_FOLD_SUMMARY pass=' + pass + ' fail=' + fail);
  if (fail) { console.error('FAIL — ' + fail + ' check(s) failed'); process.exit(1); }
  console.log('PASS — the fold is real: section collapsed by default, engines lazy, old tab gone, import/export/diff operate on app.db');
}).catch(function (e) {
  console.error('FAIL — witness threw: ' + (e && e.stack || e));
  process.exit(1);
});
