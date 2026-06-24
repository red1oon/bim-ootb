// gen_foreign_schedule.js — single source of truth for the DEMO foreign-programme fixtures.
//
// Emits the SAME canonical GW-Hospital construction programme in TWO formats:
//   tests/fixtures/Hospital_GW_Programme.xml  (Primavera P6 PMXML, the open structured export)
//   tests/fixtures/Hospital_GW_Programme.xer  (Primavera XER, the de-facto interchange)
//   tests/fixtures/Hospital_GW_binding.json   (activity -> {discipline,ifcClass[]} predicate for 4D bind)
//
// ⚠ DEMO ARTIFACT, NOT A PROOF FIXTURE. The plan (activities/dates) is synthetic so the user can
// demo the import + 4D bind. It is NOT a real P6 export and does NOT prove real-P6-quirk fidelity
// (that still needs a real .xer/.xml — see prompts/XER_IMPORT_P6_ADOPT_LANE.md §FIXTURE). What IS
// real: the WBS/disciplines/IFC classes are grounded in Hospital_meta.db's actual 63,415 elements,
// and the binding sidecar maps each activity to REAL element classes so the demo's 4D bind is genuine.
//
// Deterministic: fixed project start, no Date.now/Math.random. Dates+float come from a real
// forward/backward CPM pass over the network (so our engine's computeCpm agrees with the file).

'use strict';
var fs = require('fs');
var path = require('path');
var OUT = path.join(__dirname, 'fixtures');

// ── The canonical programme ────────────────────────────────────────────────────────────────────
// hrsPerDay drives the hour<->day conversion both formats carry (XER stores hours, PMXML too).
var HPD = 8;
var PROJECT = { id: 'GW-HOSP', name: 'GW Hospital — Construction Programme', start: '2026-02-02' };
var CAL = { id: 1, name: 'Standard 5-Day', hpd: HPD };

// WBS nodes (summary). code is the outline number; parent links by id.
var WBS = [
  { id: 'W1', code: '1', name: 'Substructure',        parent: null },
  { id: 'W2', code: '2', name: 'Superstructure',      parent: null },
  { id: 'W3', code: '3', name: 'Building Envelope',   parent: null },
  { id: 'W4', code: '4', name: 'MEP First Fix',       parent: null },
  { id: 'W5', code: '5', name: 'Finishes & Fit-out',  parent: null },
  { id: 'W6', code: '6', name: 'Commissioning',       parent: null },
];

// Leaf activities. dur in DAYS. disc/classes ground the binding to real Hospital elements.
var ACT = [
  { id: 'A1010', wbs: 'W1', name: 'Footings & Foundations',     dur: 30, disc: 'STR',  classes: ['IfcFooting'] },
  { id: 'A2010', wbs: 'W2', name: 'Columns',                    dur: 25, disc: 'STR',  classes: ['IfcColumn'] },
  { id: 'A2020', wbs: 'W2', name: 'Beams',                      dur: 30, disc: 'STR',  classes: ['IfcBeam'] },
  { id: 'A2030', wbs: 'W2', name: 'Structural Framing',         dur: 35, disc: 'STR',  classes: ['IfcMember'] },
  { id: 'A3010', wbs: 'W3', name: 'External & Internal Walls',  dur: 40, disc: 'ARC',  classes: ['IfcWall','IfcWallStandardCase'] },
  { id: 'A3020', wbs: 'W3', name: 'Curtain Walling',            dur: 25, disc: 'ARC',  classes: ['IfcCurtainWall'] },
  { id: 'A3030', wbs: 'W3', name: 'Doors & Windows',            dur: 20, disc: 'ARC',  classes: ['IfcDoor','IfcWindow'] },
  { id: 'A4010', wbs: 'W4', name: 'Plumbing Pipework',          dur: 45, disc: 'PLB',  classes: ['IfcPipeSegment'] },
  { id: 'A4020', wbs: 'W4', name: 'HVAC Ductwork',              dur: 50, disc: 'MEP',  classes: ['IfcDuctSegment'] },
  { id: 'A4030', wbs: 'W4', name: 'Fire Protection',           dur: 30, disc: 'FP',   classes: ['IfcFireSuppressionTerminal'] },
  { id: 'A4040', wbs: 'W4', name: 'Electrical & Lighting',      dur: 40, disc: 'ELEC', classes: ['IfcLightFixture'] },
  { id: 'A5010', wbs: 'W5', name: 'Internal Finishes',          dur: 35, disc: 'ARC',  classes: ['IfcCovering'] },
  { id: 'A5020', wbs: 'W5', name: 'Medical Equipment & Furniture', dur: 20, disc: 'ARC', classes: ['IfcFurniture'] },
  { id: 'A6010', wbs: 'W6', name: 'MEP Commissioning',          dur: 25, disc: 'MEP',  classes: ['IfcValve'] },
];

// Relationships — exercises all four P6 types + lag. {pred, succ, type: FS|SS|FF|SF, lag(days)}.
var REL = [
  { pred: 'A1010', succ: 'A2010', type: 'FS', lag: 0 },
  { pred: 'A2010', succ: 'A2020', type: 'FS', lag: 0 },
  { pred: 'A2020', succ: 'A2030', type: 'FS', lag: 0 },
  { pred: 'A2030', succ: 'A3010', type: 'FS', lag: 0 },
  { pred: 'A3010', succ: 'A3020', type: 'SS', lag: 10 },  // curtain walling starts 10d into walls
  { pred: 'A3010', succ: 'A3030', type: 'FS', lag: 0 },
  { pred: 'A3030', succ: 'A4010', type: 'SS', lag: 5 },   // MEP first-fix as floors are enclosed
  { pred: 'A4010', succ: 'A4020', type: 'SS', lag: 5 },
  { pred: 'A4020', succ: 'A4030', type: 'SS', lag: 5 },
  { pred: 'A4030', succ: 'A4040', type: 'SS', lag: 5 },
  { pred: 'A4040', succ: 'A5010', type: 'FS', lag: 0 },
  { pred: 'A5010', succ: 'A5020', type: 'FS', lag: 0 },
  { pred: 'A4040', succ: 'A6010', type: 'FF', lag: 0 },   // commissioning finishes with electrical
  { pred: 'A5020', succ: 'A6010', type: 'FS', lag: 0 },
];

// ── CPM forward/backward pass (mirrors schedule_author.computeCpm: FS/SS/FF/SF + lag) ────────────
function cpm() {
  var dur = {}, ES = {}, EF = {}, LS = {}, LF = {};
  ACT.forEach(function (a) { dur[a.id] = a.dur; });
  var ids = ACT.map(function (a) { return a.id; });
  var preds = {}, succs = {};
  ids.forEach(function (i) { preds[i] = []; succs[i] = []; });
  REL.forEach(function (r) { succs[r.pred].push(r); preds[r.succ].push(r); });

  // Kahn topo order
  var indeg = {}; ids.forEach(function (i) { indeg[i] = preds[i].length; });
  var q = ids.filter(function (i) { return indeg[i] === 0; }), topo = [];
  while (q.length) {
    var n = q.shift(); topo.push(n);
    succs[n].forEach(function (r) { if (--indeg[r.succ] === 0) q.push(r.succ); });
  }
  if (topo.length !== ids.length) throw new Error('cycle in demo network');

  // Forward: ES/EF honouring each relation type
  topo.forEach(function (i) {
    var es = 0;
    preds[i].forEach(function (r) {
      var c = 0;
      if (r.type === 'FS') c = EF[r.pred] + r.lag;
      else if (r.type === 'SS') c = ES[r.pred] + r.lag;
      else if (r.type === 'FF') c = EF[r.pred] + r.lag - dur[i];
      else if (r.type === 'SF') c = ES[r.pred] + r.lag - dur[i];
      if (c > es) es = c;
    });
    ES[i] = es; EF[i] = es + dur[i];
  });
  var PF = Math.max.apply(null, ids.map(function (i) { return EF[i]; }));

  // Backward: LS/LF
  topo.slice().reverse().forEach(function (i) {
    var lf = PF;
    if (succs[i].length) {
      lf = Infinity;
      succs[i].forEach(function (r) {
        var c;
        if (r.type === 'FS') c = LS[r.succ] - r.lag;
        else if (r.type === 'SS') c = LS[r.succ] - r.lag + dur[i];
        else if (r.type === 'FF') c = LF[r.succ] - r.lag;
        else if (r.type === 'SF') c = LF[r.succ] - r.lag + dur[i];
        if (c < lf) lf = c;
      });
    }
    LF[i] = lf; LS[i] = lf - dur[i];
  });

  var out = {};
  ids.forEach(function (i) {
    var tf = LS[i] - ES[i];
    out[i] = { es: ES[i], ef: EF[i], ls: LS[i], lf: LF[i], tf: tf, critical: tf <= 0 };
  });
  out.__PF = PF;
  return out;
}

// ── date helpers (calendar-day arithmetic from PROJECT.start, UTC, deterministic) ────────────────
function addDays(base, d) {
  return new Date(Date.parse(base + 'T00:00:00Z') + d * 86400000).toISOString().slice(0, 10);
}
function startStr(d) { return addDays(PROJECT.start, d) + ' 08:00'; }
function finishStr(d) { return addDays(PROJECT.start, d) + ' 17:00'; }     // EF day, end of shift
function iso(d, t) { return addDays(PROJECT.start, d) + 'T' + t; }

var CP = cpm();

// ── XER emitter (tab-delimited %T/%F/%R) ─────────────────────────────────────────────────────────
function emitXER() {
  var TAB = '\t', L = [];
  function row(tag, cells) { L.push([tag].concat(cells).join(TAB)); }
  L.push(['ERMHDR', '19.12', '2026-02-01', 'Project', 'admin', 'admin', '', 'USD', 'GW-HOSP'].join(TAB));

  row('%T', ['PROJECT']);
  row('%F', ['proj_id', 'proj_short_name', 'plan_start_date', 'clndr_id']);
  row('%R', [1, PROJECT.id, PROJECT.start + ' 08:00', CAL.id]);

  row('%T', ['CALENDAR']);
  row('%F', ['clndr_id', 'clndr_name', 'day_hr_cnt']);
  row('%R', [CAL.id, CAL.name, CAL.hpd]);

  row('%T', ['PROJWBS']);
  row('%F', ['wbs_id', 'proj_id', 'parent_wbs_id', 'wbs_short_name', 'wbs_name', 'proj_node_flag']);
  WBS.forEach(function (w) {
    row('%R', [w.id, 1, w.parent || '', w.code, w.name, w.parent ? 'N' : 'Y']);
  });

  row('%T', ['TASK']);
  row('%F', ['task_id', 'proj_id', 'wbs_id', 'task_code', 'task_name', 'task_type',
    'target_drtn_hr_cnt', 'target_start_date', 'target_end_date',
    'total_float_hr_cnt', 'free_float_hr_cnt', 'driving_path_flag', 'status_code']);
  ACT.forEach(function (a) {
    var c = CP[a.id];
    row('%R', [a.id, 1, a.wbs, a.id, a.name, 'TT_Task',
      a.dur * HPD, startStr(c.es), finishStr(c.ef),
      c.tf * HPD, c.tf * HPD, c.critical ? 'Y' : 'N', 'TK_NotStart']);
  });

  row('%T', ['TASKPRED']);
  row('%F', ['task_pred_id', 'task_id', 'pred_task_id', 'pred_type', 'lag_hr_cnt']);
  REL.forEach(function (r, i) {
    row('%R', [i + 1, r.succ, r.pred, 'PR_' + r.type, r.lag * HPD]);
  });

  L.push('%E');
  return L.join('\n') + '\n';
}

// ── PMXML emitter (Primavera P6 APIBusinessObjects, the open structured export) ──────────────────
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
var TYPENAME = { FS: 'Finish to Start', SS: 'Start to Start', FF: 'Finish to Finish', SF: 'Start to Finish' };
function emitPMXML() {
  var x = [];
  x.push('<?xml version="1.0" encoding="UTF-8"?>');
  x.push('<APIBusinessObjects xmlns="http://xmlns.oracle.com/Primavera/P6/V8.2/API/BusinessObjects">');
  x.push('  <Project>');
  x.push('    <Id>' + esc(PROJECT.id) + '</Id>');
  x.push('    <Name>' + esc(PROJECT.name) + '</Name>');
  x.push('    <PlannedStartDate>' + PROJECT.start + 'T08:00:00</PlannedStartDate>');
  x.push('    <Calendar>');
  x.push('      <ObjectId>' + CAL.id + '</ObjectId>');
  x.push('      <Name>' + esc(CAL.name) + '</Name>');
  x.push('      <HoursPerDay>' + CAL.hpd + '</HoursPerDay>');
  x.push('    </Calendar>');
  WBS.forEach(function (w) {
    x.push('    <WBS>');
    x.push('      <ObjectId>' + w.id + '</ObjectId>');
    x.push('      <Code>' + esc(w.code) + '</Code>');
    x.push('      <Name>' + esc(w.name) + '</Name>');
    x.push('      <ParentObjectId>' + (w.parent || '') + '</ParentObjectId>');
    x.push('    </WBS>');
  });
  ACT.forEach(function (a) {
    var c = CP[a.id];
    x.push('    <Activity>');
    x.push('      <Id>' + esc(a.id) + '</Id>');
    x.push('      <Name>' + esc(a.name) + '</Name>');
    x.push('      <WBSObjectId>' + a.wbs + '</WBSObjectId>');
    x.push('      <PlannedDuration>' + (a.dur * HPD) + '</PlannedDuration>');  // hours
    x.push('      <PlannedStartDate>' + iso(c.es, '08:00:00') + '</PlannedStartDate>');
    x.push('      <PlannedFinishDate>' + iso(c.ef, '17:00:00') + '</PlannedFinishDate>');
    x.push('      <TotalFloat>' + (c.tf * HPD) + '</TotalFloat>');
    x.push('      <FreeFloat>' + (c.tf * HPD) + '</FreeFloat>');
    x.push('      <Status>Not Started</Status>');
    x.push('    </Activity>');
  });
  REL.forEach(function (r) {
    x.push('    <Relationship>');
    x.push('      <PredecessorActivityId>' + esc(r.pred) + '</PredecessorActivityId>');
    x.push('      <SuccessorActivityId>' + esc(r.succ) + '</SuccessorActivityId>');
    x.push('      <Type>' + TYPENAME[r.type] + '</Type>');
    x.push('      <Lag>' + (r.lag * HPD) + '</Lag>');  // hours
    x.push('    </Relationship>');
  });
  x.push('  </Project>');
  x.push('</APIBusinessObjects>');
  return x.join('\n') + '\n';
}

// ── binding sidecar — activity -> real-element predicate (grounds the demo 4D bind) ──────────────
function emitBinding() {
  return JSON.stringify({
    _note: 'DEMO binding map. activity_code -> {discipline, ifcClasses}. The importer leaves ' +
      'task_elements EMPTY (XER/PMXML carry no model guids); the demo/witness resolves these ' +
      'predicates against the REAL building DB and binds via ScheduleAuthor.assignElement. ' +
      'Real elements, synthetic plan.',
    building: 'Hospital',
    activities: ACT.map(function (a) { return { code: a.id, name: a.name, discipline: a.disc, ifcClasses: a.classes }; }),
  }, null, 2) + '\n';
}

// ── write ────────────────────────────────────────────────────────────────────────────────────────
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'Hospital_GW_Programme.xer'), emitXER());
fs.writeFileSync(path.join(OUT, 'Hospital_GW_Programme.xml'), emitPMXML());
fs.writeFileSync(path.join(OUT, 'Hospital_GW_binding.json'), emitBinding());

var crit = ACT.filter(function (a) { return CP[a.id].critical; }).map(function (a) { return a.id; });
console.log('§GEN wrote XER+PMXML+binding to ' + OUT);
console.log('§GEN project=' + PROJECT.id + ' wbs=' + WBS.length + ' activities=' + ACT.length +
  ' relationships=' + REL.length + ' projectDays=' + CP.__PF);
console.log('§GEN criticalPath(' + crit.length + ')=' + crit.join('->'));
