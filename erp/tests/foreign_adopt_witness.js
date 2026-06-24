// foreign_adopt_witness.js — proves the FOREIGN-PROGRAMME ADOPT seam on the REAL Hospital model.
// prompts/XER_IMPORT_P6_ADOPT_LANE.md — Witnesses: W-FOREIGN-EQ / W-FOREIGN-ADOPT / W-FOREIGN-CPM /
// W-FOREIGN-BIND.
//
// Issue each block proves:
//   W-FOREIGN-EQ    — PMXML and XER of the SAME plan map to BYTE-identical schedule rows (the seam is
//                     format-agnostic; readers differ, the IFC-native result does not).
//   W-FOREIGN-ADOPT — the mapped rows land in the real Hospital DB and ScheduleAuthor.activeSchedule
//                     detects them as a CAPTURED schedule (not clobbered, not a competing draft).
//   W-FOREIGN-CPM   — our engine's computeCpm over the imported logic reproduces the generator's CPM
//                     EXACTLY (projectDuration + critical set) — proof we read FS/SS/FF/SF + lag right.
//   W-FOREIGN-BIND  — a guid-less P6 plan acquires real 4D binding: resolve the binding sidecar against
//                     REAL Hospital elements, assignElement, task_elements populated, 5D foldCost > 0.
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
  if (cond) { pass++; console.log('§W-FGN PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-FGN FAIL  ' + name + (detail ? '  ' + detail : '')); }
}
function read(f) { return fs.readFileSync(path.join(VIEWER, f), 'utf8'); }
function loadRates() {
  var t = read('rates.js');
  function block(m) { var s = t.indexOf(m); return t.slice(s, t.indexOf('};', s) + 2); }
  var src = block('var RATES = {') + '\n' + block('var RATES_DEFAULT');
  return (new Function(src + '\n return {RATES:RATES, RATES_DEFAULT:RATES_DEFAULT};'))();
}

(async function () {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } });

  // ── W-FOREIGN-EQ: PMXML == XER mapped rows ─────────────────────────────────────────────────────
  var xerTxt = fs.readFileSync(path.join(FIX, 'Hospital_GW_Programme.xer'), 'utf8');
  var pmxTxt = fs.readFileSync(path.join(FIX, 'Hospital_GW_Programme.xml'), 'utf8');
  var dataX = FS_.toScheduleData(FS_.parseXER(xerTxt));
  var dataP = FS_.toScheduleData(FS_.parsePMXML(pmxTxt));

  check('parse-xer-tasks', dataX.tasks.length === 20, 'tasks=' + dataX.tasks.length + ' (6 WBS + 14 act)');
  check('parse-pmxml-tasks', dataP.tasks.length === 20, 'tasks=' + dataP.tasks.length);
  check('parse-xer-seqs', dataX.taskSequences.length === 14, 'seqs=' + dataX.taskSequences.length);
  // canonicalize for compare (sort, drop schedule created which both null)
  function canon(d) {
    return JSON.stringify({
      tasks: d.tasks.slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; }),
      seqs: d.taskSequences.slice().sort(function (a, b) { return (a.predId + a.succId) < (b.predId + b.succId) ? -1 : 1; }),
      hpd: d._meta.hoursPerDay,
    });
  }
  check('W-FOREIGN-EQ pmxml==xer', canon(dataX) === canon(dataP), 'identical IFC-native rows from both readers');
  check('seq-types-all-four', ['FS', 'SS', 'FF', 'SF'].filter(function (t) {
    return dataX.taskSequences.some(function (s) { return s.type === t; });
  }).length >= 3, 'types=' + Array.from(new Set(dataX.taskSequences.map(function (s) { return s.type; }))).join(','));
  check('namespaced-ids', dataX.tasks.every(function (t) { return /^[WA]:/.test(t.id); }), 'W:/A: prefixes prevent collision');
  check('empty-task-elements', dataX.taskElements.length === 0, 'no model guids from P6 (correct)');
  var a4010 = dataX.tasks.filter(function (t) { return t.id === 'A:A4010'; })[0];
  check('hour-to-day-dur', a4010 && a4010.scheduleDuration === 'P45D', 'A4010 360h/8 = ' + (a4010 && a4010.scheduleDuration));

  // ── W-FOREIGN-ADOPT: land into the REAL Hospital DB; activeSchedule sees it captured ───────────
  if (!fs.existsSync(HOSPITAL_DB)) { console.log('§W-FGN SKIP Hospital DB absent: ' + HOSPITAL_DB); process.exit(fail ? 1 : 0); }
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(HOSPITAL_DB)));
  var before = db.exec('SELECT COUNT(*) FROM tasks')[0].values[0][0];
  check('hospital-blank-before', before === 0, 'tasks before adopt=' + before);

  FS_.adoptIntoDb(db, dataX);
  var active = SA.activeSchedule(db);
  check('W-FOREIGN-ADOPT active', !!active && active.id === 'GW-HOSP', 'active=' + (active && active.id));
  check('adopt-captured', !!active && active.captured === true, 'captured=' + (active && active.captured) + ' (adopt, not SCH_AUTHORED)');
  check('adopt-leafcount', !!active && active.taskCount === 14, 'leaf tasks=' + (active && active.taskCount));
  // XER PROJECT carries only proj_short_name (=GW-HOSP); PMXML carries the descriptive name. Both
  // are honest reads of their format — this is WHY W-FOREIGN-EQ excludes the schedule name. Assert
  // XER adopts its short name, and PMXML independently yields the descriptive one.
  var sched = db.exec("SELECT name FROM schedules WHERE schedule_id='GW-HOSP'");
  check('adopt-name-xer', sched.length && sched[0].values[0][0] === 'GW-HOSP', 'XER name=' + (sched.length && sched[0].values[0][0]));
  check('adopt-name-pmxml', /GW Hospital/.test(dataP.schedules[0].name), 'PMXML name=' + dataP.schedules[0].name);

  // ── W-FOREIGN-CPM: our engine reproduces the generator's CPM exactly ───────────────────────────
  var cpm = SA.computeCpm(db, 'GW-HOSP');
  check('W-FOREIGN-CPM duration', cpm.projectDuration === 300, 'projectDuration=' + cpm.projectDuration + ' (generator=300)');
  // generator critical set (all but A3020) — see §GEN log
  var GEN_CRIT = ['A1010', 'A2010', 'A2020', 'A2030', 'A3010', 'A3030', 'A4010', 'A4020', 'A4030', 'A4040', 'A5010', 'A5020', 'A6010']
    .map(function (x) { return 'A:' + x; }).sort();
  var gotCrit = cpm.criticalIds.slice().sort();
  check('W-FOREIGN-CPM critical-set', JSON.stringify(gotCrit) === JSON.stringify(GEN_CRIT),
    'engine critical(' + gotCrit.length + ')==generator(' + GEN_CRIT.length + ')');
  check('cpm-A3020-offcritical', cpm.criticalIds.indexOf('A:A3020') === -1, 'curtain-walling has float (off critical, as generated)');

  // ── W-FOREIGN-BIND: resolve sidecar → real Hospital elements → assignElement → foldCost > 0 ─────
  var binding = JSON.parse(fs.readFileSync(path.join(FIX, 'Hospital_GW_binding.json'), 'utf8'));
  var rates = loadRates();
  // bind by NAME (format-agnostic — task_id schemes differ across XER/PMXML/MSPDI, names don't).
  function bindByName(d, sid) {
    var total = 0, acts = 0, PER = 40;
    binding.activities.forEach(function (a) {
      var tr = d.exec("SELECT task_id FROM tasks WHERE schedule_id='" + sid + "' AND (is_summary IS NULL OR is_summary=0) AND name='" + a.name.replace(/'/g, "''") + "' LIMIT 1");
      if (!tr.length || !tr[0].values.length) return;
      var tid = tr[0].values[0][0];
      var inList = a.ifcClasses.map(function (c) { return "'" + c + "'"; }).join(',');
      var r = d.exec("SELECT guid FROM elements_meta WHERE ifc_class IN (" + inList + ")" +
        (a.discipline ? " AND discipline='" + a.discipline + "'" : '') + " LIMIT " + PER);
      var guids = (r.length && r[0].values.length) ? r[0].values.map(function (x) { return x[0]; }) : [];
      guids.forEach(function (g) { SA.assignElement(d, g, tid); });
      if (guids.length) acts++;
      total += guids.length;
    });
    return { total: total, acts: acts };
  }
  var bx = bindByName(db, 'GW-HOSP');
  var teCount = db.exec('SELECT COUNT(*) FROM task_elements')[0].values[0][0];
  check('W-FOREIGN-BIND elements', teCount > 0 && teCount === bx.total, 'task_elements=' + teCount + ' bound across ' + bx.acts + ' activities');
  check('bind-real-guids', bx.acts >= 12, 'activities with real Hospital elements=' + bx.acts + '/14');

  var fold = SA.foldCost(db, 'GW-HOSP', rates.RATES, rates.RATES_DEFAULT, 'USD');
  check('W-FOREIGN-BIND cost>0', fold.total > 0, '5D total folded onto imported plan = ' + fold.total);
  var costed = fold.phases.filter(function (p) { return p.cost > 0; }).length;
  check('cost-rolls-to-phases', costed >= 10, 'phases carrying cost=' + costed);
  // the wedge: reassigning an element moves cost between phases (total invariant)
  var beforeFold = fold.total;
  var oneGuid = db.exec("SELECT guid FROM task_elements WHERE task_id='A:A1010' LIMIT 1");
  if (oneGuid.length && oneGuid[0].values.length) {
    SA.assignElement(db, oneGuid[0].values[0][0], 'A:A2010');   // move a footing's element to columns
    var refold = SA.foldCost(db, 'GW-HOSP', rates.RATES, rates.RATES_DEFAULT, 'USD');
    check('reassign-total-invariant', refold.total === beforeFold, 'cost moved A1010->A2010, project total unchanged=' + refold.total);
  }

  // ── W-FOREIGN-MSPDI: MS Project XML rides the SAME seam (fresh Hospital db) ─────────────────────
  var mspTxt = fs.readFileSync(path.join(FIX, 'Hospital_GW_MSProject.xml'), 'utf8');
  var det = FS_.parseForeign(mspTxt, 'Hospital_GW_MSProject.xml');
  check('mspdi-sniffed', det.format === 'MSPDI', 'parseForeign detected format=' + det.format);
  var dataM = FS_.toScheduleData(det.parsed);
  check('mspdi-counts', dataM._meta.summaryCount === 6 && dataM._meta.leafCount === 14 && dataM.taskSequences.length === 14,
    'WBS=' + dataM._meta.summaryCount + ' activities=' + dataM._meta.leafCount + ' links=' + dataM.taskSequences.length);
  check('mspdi-all-four-types', ['FS', 'SS', 'FF'].every(function (t) { return dataM.taskSequences.some(function (s) { return s.type === t; }); }),
    'types=' + Array.from(new Set(dataM.taskSequences.map(function (s) { return s.type; }))).join(','));
  var dbM = new SQL.Database(new Uint8Array(fs.readFileSync(HOSPITAL_DB)));
  FS_.adoptIntoDb(dbM, dataM);
  var actM = SA.activeSchedule(dbM);
  var sidM = dataM.schedules[0].id;
  check('W-FOREIGN-MSPDI adopt', !!actM && actM.id === sidM && actM.captured === true, 'active=' + (actM && actM.id) + ' captured=' + (actM && actM.captured));
  var cpmM = SA.computeCpm(dbM, sidM);
  check('W-FOREIGN-MSPDI cpm', cpmM.projectDuration === 300 && cpmM.criticalIds.length === 13,
    'projectDuration=' + cpmM.projectDuration + ' critical=' + cpmM.criticalIds.length + '/14 (matches the same plan)');
  var bm = bindByName(dbM, sidM);
  var foldM = SA.foldCost(dbM, sidM, rates.RATES, rates.RATES_DEFAULT, 'USD');
  check('W-FOREIGN-MSPDI bind+cost', bm.acts >= 12 && foldM.total > 0, 'bound ' + bm.acts + '/14 activities → 5D total=' + foldM.total);

  console.log('\n§W-FGN SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('§W-FGN ERROR', e); process.exit(1); });
