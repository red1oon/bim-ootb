// author_wizard_wiring.js — W-AUTHOR-WIZARD-WIRE (FUSED_4D5D_WEDGE_LANE §AUTHOR-1 slice-2)
//
// ISSUE PROVED: the authoring wizard is correctly MOUNTED on the Time-Machine surface and its
// button handlers invoke the proven engine. Specifically:
//   (a) schedule_author_ui.js loads and exposes the launch API the TM `tm-author` button calls;
//   (b) the TM panel hosts `tm-author` + `tm-whatif` buttons wired to ScheduleAuthorUI / WhatIfPanel;
//   (c) what-if is RE-HOMED off the Find box (no `find-whatif-btn` left) → TM (§ARCH-OWNERSHIP);
//   (d) both scripts are registered in viewer.html;
//   (e) the engine calls the wizard handlers make (materializeDefault → assignElement) still fold a
//       valid authored schedule on the REAL model (the value-correctness itself is W-AUTHOR-4D-BLANK).
//
// Live browser smoke (click → panel renders → draft) is deferred to deploy: the sandbox has no
// browser/jsdom. Whitebox §-log + module-load + real-engine proof here, per docs/TestArchitecture
// §Browser Testing (§-log first, Playwright second).

var fs = require('fs');
var path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var ROOT = path.resolve(__dirname, '..', '..');
var VIEWER = path.join(ROOT, 'viewer');
var SH_DB = '/home/red1/bim-compiler/deploy/buildings/SampleHouse_extracted.db';

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-WIRE PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-WIRE FAIL  ' + name + (detail ? '  ' + detail : '')); }
}
function read(f) { return fs.readFileSync(path.join(VIEWER, f), 'utf8'); }

(async function () {
  // ── (a) UI module loads and exposes the launch API (no DOM needed at load) ────
  // Provide a minimal global so the IIFE's top-level (globals + console.log) runs cleanly.
  var stub = { console: console };
  global.self = stub;                                  // module binds to `self`
  require(path.join(VIEWER, 'schedule_author_ui.js'));
  check('ui-exposes-open', typeof stub.openScheduleAuthorWizard === 'function', 'openScheduleAuthorWizard');
  check('ui-exposes-toggle', !!(stub.ScheduleAuthorUI && typeof stub.ScheduleAuthorUI.toggle === 'function'), 'ScheduleAuthorUI.toggle');

  // ── (b) TM panel hosts the two buttons + wires them to the TM-owned engines ───
  var tm = read('time_machine.js');
  check('tm-author-button', tm.indexOf("id=\"tm-author\"") >= 0, 'tm-author in panel');
  check('tm-whatif-button', tm.indexOf("id=\"tm-whatif\"") >= 0, 'tm-whatif in panel');
  check('tm-author-wired', /tm-author[\s\S]{0,400}ScheduleAuthorUI/.test(tm), 'handler→ScheduleAuthorUI');
  check('tm-whatif-wired', /tm-whatif[\s\S]{0,400}WhatIfPanel\.open/.test(tm), 'handler→WhatIfPanel.open');

  // ── (c) what-if RE-HOMED off Find (satellite no longer owns the launch) ───────
  var nf = read('navigate_find.js');
  check('find-whatif-button-removed', nf.indexOf('find-whatif-btn') < 0, 'no find-whatif-btn');
  check('find-whatif-handler-removed', nf.indexOf('WhatIfPanel.open') < 0, 'no WhatIfPanel.open in Find');
  check('find-rehome-note', nf.indexOf('RE-HOMED') >= 0, 'rehome rationale documented');

  // ── (d) scripts registered in viewer.html ────────────────────────────────────
  var html = read('viewer.html');
  check('html-loads-engine', /schedule_author\.js\?v=/.test(html), 'schedule_author.js included');
  check('html-loads-ui', /schedule_author_ui\.js\?v=/.test(html), 'schedule_author_ui.js included');
  // pill discoverability
  var pj = read('panels.js');
  check('pill-children-author', pj.indexOf('Author 4D schedule') >= 0, 'tm pill child added');

  // ── (e) the engine calls the wizard handlers make work on the REAL model ──────
  // generateDraft() → ScheduleAuthor.materializeDefault ; reassign() → ScheduleAuthor.assignElement.
  var SA = require(path.join(VIEWER, 'schedule_author.js'));
  var rulesTxt = read('rates.js');
  var rs = rulesTxt.indexOf('var SEQUENCE_RULES = {');
  var di = rulesTxt.indexOf('var SEQUENCE_DEFAULT');
  var slice = rulesTxt.slice(rs, rulesTxt.indexOf('};', di) + 2);
  // eslint-disable-next-line no-new-func
  var RULES = (new Function(slice + '\n return SEQUENCE_RULES;'))();

  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(SH_DB)));
  var res = SA.materializeDefault(db, RULES, { start: '2026-01-01', phaseDays: 30 });
  check('handler-draft-folds', res.phases.length >= 2 && res.assignmentCount > 0,
    'phases=' + res.phases.length + ' assignments=' + res.assignmentCount);
  // reassign verb the dropdown invokes
  var anyEl = db.exec("SELECT guid FROM elements_meta LIMIT 1")[0].values[0][0];
  var target = res.phases[res.phases.length - 1].taskId;
  var asg = SA.assignElement(db, anyEl, target);
  var bound = db.exec("SELECT task_id FROM task_elements WHERE guid='" + anyEl + "'");
  check('handler-reassign-binds', asg.ok && bound[0].values[0][0] === target,
    'guid→' + (bound.length && bound[0].values[0][0]));

  console.log('§W-AUTHOR-WIZARD-WIRE RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('§W-WIRE ERROR', e); process.exit(2); });
