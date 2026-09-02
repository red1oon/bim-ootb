// schedule_editor_witness.js — W-SCHED-EDIT (FUSED_4D5D_WEDGE_LANE §SE-1)
//
// ISSUE PROVED: step 1+2 of the MSP-grade Gantt arc works on the engine — a user can SEE the schedule
// as a WBS outline (wbsTree) and AUTHOR its dependencies (add / list / retype / lag / remove on the
// IFC-native task_sequences table), with an invalid CYCLE refused deterministically (data integrity,
// NOT optimisation — §SE-B boundary). Source of truth = task_sequences, written directly exactly as
// assignElement writes task_elements (kernel_ops signing deferred).
//
// Non-invent: real SampleHouse_extracted.db (genuinely blank 4D) materialised to an organized default;
// the phase rules are EXTRACTED VERBATIM from viewer/rates.js. Whitebox §-log proof only (CLAUDE.md:
// prove the engine, don't boot a browser).

var fs = require('fs');
var path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');

var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var ROOT = path.resolve(__dirname, '..', '..');           // worktree root
var VIEWER = path.join(ROOT, 'viewer');
var SH_DB = '/home/red1/bim-compiler/deploy/buildings/SampleHouse_extracted.db';

var ScheduleAuthor = require(path.join(VIEWER, 'schedule_author.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-SCHED-EDIT PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-SCHED-EDIT FAIL  ' + name + (detail ? '  ' + detail : '')); }
}

// Extract SEQUENCE_RULES + SEQUENCE_DEFAULT verbatim from rates.js (same loader as author_4d_witness).
function loadRules() {
  var txt = fs.readFileSync(path.join(VIEWER, 'rates.js'), 'utf8');
  var start = txt.indexOf('var SEQUENCE_RULES = {');
  var defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  var end = txt.indexOf('};', defIdx) + 2;
  var slice = txt.slice(start, end);
  // eslint-disable-next-line no-new-func
  return (new Function(slice + '\n return { SEQUENCE_RULES: SEQUENCE_RULES, SEQUENCE_DEFAULT: SEQUENCE_DEFAULT };'))();
}

// Flatten the wbsTree into a list with depth, to assert outline shape.
function flatten(roots, depth, out) {
  out = out || []; depth = depth || 0;
  roots.forEach(function (n) { out.push({ node: n, depth: depth }); flatten(n.children, depth + 1, out); });
  return out;
}

(async function () {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } });
  var rulesPack = loadRules();
  var RULES = rulesPack.SEQUENCE_RULES, DEFAULT = rulesPack.SEQUENCE_DEFAULT;
  console.log('§W-SCHED-EDIT RULES-LOADED keys=' + Object.keys(RULES).length + ' default=' + DEFAULT.phase);

  var db = new SQL.Database(new Uint8Array(fs.readFileSync(SH_DB)));
  var SCHED = 'SCH_AUTHORED';

  // ── precondition: blank 4D, then materialise the organized default ───────────
  var nTasks0 = db.exec('SELECT COUNT(*) FROM tasks')[0].values[0][0];
  check('blank-precondition', nTasks0 === 0, 'tasks=' + nTasks0);
  var res = ScheduleAuthor.materializeDefault(db, RULES, { start: '2026-01-01', phaseDays: 30 });
  check('phases-materialised', res.phases.length >= 3, 'phases=' + res.phases.length);

  // ── STEP 1: WBS outline (wbsTree) ────────────────────────────────────────────
  var roots = ScheduleAuthor.wbsTree(db, SCHED);
  check('wbs-one-root', roots.length === 1, 'roots=' + roots.length);
  var rootNode = roots[0];
  check('wbs-root-is-summary', !!(rootNode && rootNode.isSummary), 'rootSummary=' + (rootNode && rootNode.isSummary));
  var flat = flatten(roots);
  var leaves = flat.filter(function (f) { return !f.node.isSummary; });
  check('wbs-leaves-eq-phases', leaves.length === res.phases.length,
    'leaves=' + leaves.length + ' phases=' + res.phases.length);
  check('wbs-leaves-nest-depth1', leaves.every(function (f) { return f.depth === 1; }),
    'leaf depths=[' + leaves.map(function (f) { return f.depth; }).join(',') + ']');
  var withCounts = leaves.filter(function (f) { return f.node.guidCount > 0; }).length;
  check('wbs-leaves-carry-element-counts', withCounts === leaves.length,
    'leavesWithElems=' + withCounts + '/' + leaves.length);

  // The ordered leaf task ids — author an FS chain across them (the user's dependency authoring).
  var leafIds = leaves.map(function (f) { return f.node.id; });

  // ── STEP 2a: add an FS chain phase1→phase2→...→phaseN ────────────────────────
  var added = 0;
  for (var i = 0; i < leafIds.length - 1; i++) {
    var r = ScheduleAuthor.addDependency(db, leafIds[i], leafIds[i + 1], 'FS', 0);
    if (r.ok) added++;
  }
  check('dep-chain-added', added === leafIds.length - 1, 'added=' + added + ' expected=' + (leafIds.length - 1));

  var deps = ScheduleAuthor.listDependencies(db, SCHED);
  check('dep-list-count', deps.length === added, 'listed=' + deps.length);
  check('dep-list-has-names', deps.every(function (d) { return d.predName && d.succName && d.predName !== d.predId; }),
    'sample="' + (deps[0] && (deps[0].predName + ' -> ' + deps[0].succName)) + '"');
  check('dep-list-default-FS', deps.every(function (d) { return d.type === 'FS'; }), 'types ok');

  // ── STEP 2b: CYCLE GUARD — a back-edge last→first must be REFUSED ─────────────
  var back = ScheduleAuthor.addDependency(db, leafIds[leafIds.length - 1], leafIds[0], 'FS', 0);
  check('cycle-refused', back.ok === false && back.reason === 'cycle',
    'back-edge ok=' + back.ok + ' reason=' + back.reason);
  var depsAfterCycle = ScheduleAuthor.listDependencies(db, SCHED).length;
  check('cycle-not-persisted', depsAfterCycle === added, 'count still=' + depsAfterCycle);
  // self-loop + duplicate also refused
  check('self-loop-refused', ScheduleAuthor.addDependency(db, leafIds[0], leafIds[0]).reason === 'self_loop');
  check('duplicate-refused', ScheduleAuthor.addDependency(db, leafIds[0], leafIds[1]).reason === 'duplicate');

  // ── STEP 2c: retype FS→SS + set lag on the first edge ────────────────────────
  var upd = ScheduleAuthor.updateDependency(db, leafIds[0], leafIds[1], { type: 'SS', lag: 5 });
  check('dep-retype-lag', upd.ok && upd.type === 'SS' && upd.lag === 5, 'type=' + upd.type + ' lag=' + upd.lag);
  var edge0 = ScheduleAuthor.listDependencies(db, SCHED).filter(function (d) {
    return d.predId === leafIds[0] && d.succId === leafIds[1];
  })[0];
  check('dep-retype-persisted', edge0 && edge0.type === 'SS' && edge0.lag === 5,
    'persisted type=' + (edge0 && edge0.type) + ' lag=' + (edge0 && edge0.lag));

  // ── STEP 2d: remove one edge → count falls ───────────────────────────────────
  var rem = ScheduleAuthor.removeDependency(db, leafIds[0], leafIds[1]);
  check('dep-removed', rem.ok && rem.removed === 1, 'removed=' + rem.removed);
  check('dep-count-fell', ScheduleAuthor.listDependencies(db, SCHED).length === added - 1,
    'count=' + ScheduleAuthor.listDependencies(db, SCHED).length);

  console.log('§W-SCHED-EDIT RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('§W-SCHED-EDIT ERROR', e); process.exit(2); });
