// autobind_witness.js — proves §B1/§B2 of prompts/AUTOBIND_BY_CONVENTION.md on the REAL Hospital model.
//
// Issue each block proves:
//   W-BIND-TOKEN       — parseBindToken parses the three documented forms to the expected selector, a
//                        name with no token is untouched, multi-class '|' splits, and the STORED task
//                        name has the token stripped (the convention never pollutes the WBS label).
//   W-AUTOBIND         — the KEY claim: importing the tokened (.bound) file + autoBind reproduces EXACTLY
//                        the manual sidecar binding (plain file + bindByName over Hospital_GW_binding.json)
//                        — identical task_elements rows + identical foldCost total. Zero-match selectors
//                        land in unresolved[] (reported, never silently dropped).
//   W-AUTOBIND-REEXPORT— the model-independence claim: re-resolve the SAME selectors against a re-exported
//                        model (every guid renamed) → binds the CORRESPONDING elements again, same count
//                        per task, all NEW guids — proving the selector survives a re-export where a
//                        baked GUID list would bind ZERO.
'use strict';
var fs = require('fs');
var path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var VIEWER = path.join(__dirname, '..', '..', 'viewer');
var FIX = path.join(__dirname, '..', '..', 'tests', 'fixtures');
var HOSPITAL_DB = '/home/red1/bim-ootb/buildings/Hospital_meta.db';

var FS_ = require(path.join(VIEWER, 'foreign_schedule.js'));
var SA = require(path.join(VIEWER, 'schedule_author.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-AUTOBIND PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-AUTOBIND FAIL  ' + name + (detail ? '  ' + detail : '')); }
}
function read(f) { return fs.readFileSync(path.join(VIEWER, f), 'utf8'); }
function loadRates() {
  var t = read('rates.js');
  function block(m) { var s = t.indexOf(m); return t.slice(s, t.indexOf('};', s) + 2); }
  var src = block('var RATES = {') + '\n' + block('var RATES_DEFAULT');
  return (new Function(src + '\n return {RATES:RATES, RATES_DEFAULT:RATES_DEFAULT};'))();
}
function teRows(db) {
  var r = db.exec('SELECT task_id, guid FROM task_elements ORDER BY task_id, guid');
  return (r.length && r[0].values.length) ? r[0].values.map(function (x) { return x[0] + '|' + x[1]; }) : [];
}

(async function () {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } });

  // ── W-BIND-TOKEN: pure selector parse (no DB) ───────────────────────────────────────────────────
  var t1 = FS_.parseBindToken('Columns @STR:IfcColumn');
  check('token-simple-clean', t1.cleanName === 'Columns', 'cleanName=' + JSON.stringify(t1.cleanName));
  check('token-simple-selector', t1.selector && t1.selector.discipline === 'STR' &&
    JSON.stringify(t1.selector.classes) === '["IfcColumn"]' && t1.selector.storey === null,
    'selector=' + JSON.stringify(t1.selector));

  var t2 = FS_.parseBindToken('Internal Finishes @ARC:IfcCovering:Level 3');
  check('token-storey-clean', t2.cleanName === 'Internal Finishes', 'cleanName=' + JSON.stringify(t2.cleanName));
  check('token-storey-selector', t2.selector && t2.selector.discipline === 'ARC' &&
    JSON.stringify(t2.selector.classes) === '["IfcCovering"]' && t2.selector.storey === 'Level 3',
    'selector=' + JSON.stringify(t2.selector));

  var t3 = FS_.parseBindToken('Structural Framing @STR:IfcMember|IfcBeam');
  check('token-multiclass-split', t3.selector && JSON.stringify(t3.selector.classes) === '["IfcMember","IfcBeam"]',
    'classes=' + JSON.stringify(t3.selector && t3.selector.classes));

  var t4 = FS_.parseBindToken('Plain Activity Name');
  check('token-absent-untouched', t4.cleanName === 'Plain Activity Name' && t4.selector === null,
    'cleanName=' + JSON.stringify(t4.cleanName) + ' selector=' + t4.selector);

  // the stored task name carries NO token after mapping the tokened file
  var boundTxt = fs.readFileSync(path.join(FIX, 'Hospital_GW_Programme.bound.xer'), 'utf8');
  var boundData = FS_.toScheduleData(FS_.parseXER(boundTxt));
  var cols = boundData.tasks.filter(function (t) { return t.id === 'A:A2010'; })[0];
  check('token-stripped-in-mapper', cols && cols.name === 'Columns' && /IfcColumn/.test(JSON.stringify(cols.bindSelector)),
    'stored name=' + JSON.stringify(cols && cols.name) + ' selector=' + JSON.stringify(cols && cols.bindSelector));
  var sels = boundData.tasks.filter(function (t) { return t.bindSelector; }).length;
  check('token-selectors-carried', sels === 14, 'leaf tasks carrying a selector=' + sels + '/14');

  // ── need the real Hospital model from here ──────────────────────────────────────────────────────
  if (!fs.existsSync(HOSPITAL_DB)) { console.log('§W-AUTOBIND SKIP Hospital DB absent: ' + HOSPITAL_DB); console.log('\n§W-AUTOBIND SUMMARY pass=' + pass + ' fail=' + fail); process.exit(fail ? 1 : 0); }
  var rates = loadRates();
  var HOSP = new Uint8Array(fs.readFileSync(HOSPITAL_DB));

  // manual baseline (mirrors foreign_adopt_witness.bindByName but UNCAPPED — same predicate, apples-to-
  // apples: the LIMIT 40 there was a demo throttle, not part of the predicate's meaning).
  var binding = JSON.parse(fs.readFileSync(path.join(FIX, 'Hospital_GW_binding.json'), 'utf8'));
  function bindByNameUncapped(d, sid) {
    binding.activities.forEach(function (a) {
      var tr = d.exec("SELECT task_id FROM tasks WHERE schedule_id='" + sid + "' AND (is_summary IS NULL OR is_summary=0) AND name='" + a.name.replace(/'/g, "''") + "' LIMIT 1");
      if (!tr.length || !tr[0].values.length) return;
      var tid = tr[0].values[0][0];
      var inList = a.ifcClasses.map(function (c) { return "'" + c + "'"; }).join(',');
      var r = d.exec("SELECT guid FROM elements_meta WHERE ifc_class IN (" + inList + ")" +
        (a.discipline ? " AND discipline='" + a.discipline + "'" : ''));
      var guids = (r.length && r[0].values.length) ? r[0].values.map(function (x) { return x[0]; }) : [];
      guids.forEach(function (g) { SA.assignElement(d, g, tid); });
    });
  }

  // DB-AUTO: tokened file → adopt → autoBind
  var dbA = new SQL.Database(HOSP);
  FS_.adoptIntoDb(dbA, boundData);
  var res = FS_.autoBind(dbA, 'GW-HOSP');
  // DB-MANUAL: plain file → adopt → manual sidecar bind (uncapped)
  var plainData = FS_.toScheduleData(FS_.parseXER(fs.readFileSync(path.join(FIX, 'Hospital_GW_Programme.xer'), 'utf8')));
  var dbM = new SQL.Database(HOSP);
  FS_.adoptIntoDb(dbM, plainData);
  bindByNameUncapped(dbM, 'GW-HOSP');

  var teA = teRows(dbA), teM = teRows(dbM);
  check('W-AUTOBIND reproduces-sidecar', teA.length > 0 && JSON.stringify(teA) === JSON.stringify(teM),
    'autoBind task_elements(' + teA.length + ') == manual sidecar(' + teM.length + ') — byte-identical rows');
  check('autobind-bound-count', res.bound === teA.length, 'autoBind reported bound=' + res.bound + ' == rows=' + teA.length);

  var foldA = SA.foldCost(dbA, 'GW-HOSP', rates.RATES, rates.RATES_DEFAULT, 'USD');
  var foldM = SA.foldCost(dbM, 'GW-HOSP', rates.RATES, rates.RATES_DEFAULT, 'USD');
  check('W-AUTOBIND foldcost-matches', foldA.total > 0 && foldA.total === foldM.total,
    'autoBind 5D total=' + foldA.total + ' == manual=' + foldM.total);

  // zero-match selectors are reported in unresolved[], never silently dropped
  var resolved = res.perActivity.length;
  check('autobind-resolved>=12', resolved >= 12, 'activities that matched real elements=' + resolved + '/14');
  check('autobind-unresolved-reported', (resolved + res.unresolved.length) === 14,
    'resolved(' + resolved + ') + unresolved(' + res.unresolved.length + ') == 14 leaf activities (none dropped)');

  // ── W-AUTOBIND-REEXPORT: re-resolve SAME selectors against a re-exported model (every guid renamed)
  var dbR = new SQL.Database(HOSP);
  dbR.run("UPDATE elements_meta SET guid='RX_'||guid");   // simulate a re-export: fresh GUIDs, same model
  FS_.adoptIntoDb(dbR, boundData);                          // carries the SAME declared selectors
  var resR = FS_.autoBind(dbR, 'GW-HOSP');

  // same count per task as the original model (selector is model-independent)
  function perTask(db) {
    var r = db.exec('SELECT task_id, COUNT(*) FROM task_elements GROUP BY task_id ORDER BY task_id');
    var m = {}; if (r.length && r[0].values.length) r[0].values.forEach(function (x) { m[x[0]] = x[1]; }); return m;
  }
  var ptA = perTask(dbA), ptR = perTask(dbR);
  check('W-AUTOBIND-REEXPORT count-per-task', JSON.stringify(ptA) === JSON.stringify(ptR),
    'per-task bound counts identical across re-export (' + Object.keys(ptR).length + ' tasks)');

  var reRows = dbR.exec('SELECT guid FROM task_elements');
  var allRenamed = reRows.length && reRows[0].values.every(function (x) { return /^RX_/.test(x[0]); });
  check('reexport-binds-new-guids', resR.bound > 0 && allRenamed, 'all ' + resR.bound + ' bound guids are the NEW (RX_) ids');

  // the proof a GUID list could NOT do this: none of the original bound guids exist after re-export
  var origGuid = dbA.exec("SELECT guid FROM task_elements LIMIT 1")[0].values[0][0];
  var survives = dbR.exec("SELECT 1 FROM elements_meta WHERE guid='" + origGuid + "' LIMIT 1");
  check('reexport-guidlist-would-fail', !(survives.length && survives[0].values.length),
    'original guid ' + origGuid + ' absent in re-exported model → a baked GUID list binds 0');

  console.log('\n§W-AUTOBIND SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('§W-AUTOBIND ERROR', e); process.exit(1); });
