// # ⚠ DO NOT REMOVE — W-SE-WBS
// ISSUE PROVED: the Schedule Editor could view/collapse the WBS but not DEEPEN it (user: "shouldn't the
//   Editor allow adding or breakdown of further subitems?"). New engine verbs add that, and stay correct
//   for the Time Machine's _cap (no orphaned elements) and for cross-tab replay (deterministic ids):
//     addTask            — a new LEAF inherits the parent window; parent NOT forced summary (keeps coverage)
//     breakdownByAttribute — split a phase's elements by storey/type; children inherit the window; parent
//                            becomes a summary roll-up; EVERY element still sits on a non-summary leaf (_cap)
//     schedule_sync.applyOp('addtask'|'breakdown') — replays IDENTICALLY on a peer db (surfaces converge)
//   Drives the REAL verbs (require'd verbatim) on a real sql.js db. Whitebox §-log; no browser.
//   Run: node viewer/tests/witness_se_wbs_breakdown.js   → exit 0 = GREEN.
const path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
const SA = require(path.join(__dirname, '..', 'schedule_author.js'));
globalThis.ScheduleAuthor = SA;   // schedule_sync.applyOp resolves the engine via global.ScheduleAuthor
const Sync = require(path.join(__dirname, '..', 'schedule_sync.js'));

let pass = 0, fail = 0;
function ok(c, m) { c ? pass++ : fail++; console.log(`§WBS ${c ? 'PASS' : 'FAIL'} ${m}`); }

// seed: root + one dated leaf 'Architecture' holding 5 elements across 3 storeys / 2 classes
function seed(SQL) {
  const db = new SQL.Database();
  db.run(`CREATE TABLE tasks (task_id TEXT PRIMARY KEY, schedule_id TEXT, wbs_parent TEXT, name TEXT,
            predefined_type TEXT, is_summary INTEGER, schedule_start TEXT, schedule_finish TEXT,
            schedule_duration TEXT, early_start TEXT, early_finish TEXT, late_start TEXT, late_finish TEXT,
            free_float TEXT, total_float TEXT, is_critical INTEGER, resource TEXT, status TEXT);
          CREATE TABLE task_elements (task_id TEXT, guid TEXT, PRIMARY KEY (task_id, guid));
          CREATE TABLE elements_meta (guid TEXT, ifc_class TEXT, element_name TEXT, storey TEXT, discipline TEXT);`);
  db.run(`INSERT INTO tasks (task_id,schedule_id,wbs_parent,name,is_summary,schedule_start,schedule_finish,schedule_duration) VALUES
            ('TASK_ROOT','SCH_AUTHORED',NULL,'Project',1,'2026-01-01','2026-03-01','P59D'),
            ('TASK_Architecture','SCH_AUTHORED','TASK_ROOT','Architecture',0,'2026-02-01','2026-03-01','P28D');`);
  db.run(`INSERT INTO elements_meta VALUES
            ('g1','IfcWall','','L1','ARC'),('g2','IfcWall','','L2','ARC'),('g3','IfcDoor','','L2','ARC'),
            ('g4','IfcDoor','','L3','ARC'),('g5','IfcWall','','L3','ARC');`);
  db.run(`INSERT INTO task_elements VALUES ('TASK_Architecture','g1'),('TASK_Architecture','g2'),
            ('TASK_Architecture','g3'),('TASK_Architecture','g4'),('TASK_Architecture','g5');`);
  return db;
}
const capLeafCount = db => db.exec("SELECT COUNT(*) FROM task_elements te JOIN tasks t ON t.task_id=te.task_id WHERE (t.is_summary IS NULL OR t.is_summary=0)")[0].values[0][0];
const dump = db => JSON.stringify([db.exec('SELECT * FROM tasks ORDER BY task_id')[0].values,
                                   db.exec('SELECT * FROM task_elements ORDER BY task_id,guid')[0].values]);

(async () => {
  const SQL = await initSqlJs();

  // ── addTask: empty leaf under Architecture, inherits its window, parent stays a leaf (coverage intact) ──
  let db = seed(SQL);
  const a = SA.addTask(db, 'SCH_AUTHORED', { name: 'Fit-out', wbsParent: 'TASK_Architecture' });
  ok(a.ok && a.taskId === 'TASK_Fit_out', `addTask → leaf id=${a.taskId} under Architecture`);
  const ar = db.exec("SELECT wbs_parent,is_summary,schedule_start,schedule_finish FROM tasks WHERE task_id='TASK_Fit_out'")[0].values[0];
  ok(ar[0] === 'TASK_Architecture' && ar[1] === 0 && ar[2] === '2026-02-01' && ar[3] === '2026-03-01', `child is_summary=0, inherits parent window 02-01..03-01`);
  ok(db.exec("SELECT is_summary FROM tasks WHERE task_id='TASK_Architecture'")[0].values[0][0] === 0, `parent NOT forced to summary (keeps its elements + _cap coverage)`);
  ok(capLeafCount(db) === 5, `all 5 elements still on non-summary leaves after addTask`);
  const a2 = SA.addTask(db, 'SCH_AUTHORED', { name: 'Fit-out', wbsParent: 'TASK_Architecture' });
  ok(a2.taskId === 'TASK_Fit_out_2', `name collision → suffixed id ${a2.taskId} (no clobber)`);

  // ── breakdownByAttribute: split Architecture by storey → 3 children, parent becomes summary ──
  db = seed(SQL);
  const b = SA.breakdownByAttribute(db, 'SCH_AUTHORED', 'TASK_Architecture', 'storey');
  ok(b.ok && b.groups.length === 3, `breakdown by storey → 3 groups (L1,L2,L3)`);
  ok(b.groups.map(g => g.taskId).join(',') === 'TASK_Architecture__L1,TASK_Architecture__L2,TASK_Architecture__L3', `deterministic child ids parent__<storey>`);
  ok(db.exec("SELECT is_summary FROM tasks WHERE task_id='TASK_Architecture'")[0].values[0][0] === 1, `parent → summary roll-up after its elements moved out`);
  ok(db.exec("SELECT COUNT(*) FROM task_elements WHERE task_id='TASK_Architecture'")[0].values[0][0] === 0, `parent holds 0 direct elements (all moved to children)`);
  ok(capLeafCount(db) === 5, `all 5 elements still on non-summary leaves (NO _cap coverage lost)`);
  const l2 = db.exec("SELECT schedule_start,schedule_finish FROM tasks WHERE task_id='TASK_Architecture__L2'")[0].values[0];
  ok(l2[0] === '2026-02-01' && l2[1] === '2026-03-01', `child inherits parent date window`);

  // ── single-group guard: breakdown by discipline (all 'ARC') → refuse, nothing changed ──
  const before = dump(db = seed(SQL));
  const sg = SA.breakdownByAttribute(db, 'SCH_AUTHORED', 'TASK_Architecture', 'discipline');
  ok(!sg.ok && sg.reason === 'single_group', `breakdown refused when only one group (all ARC)`);
  ok(dump(db) === before, `single-group breakdown left the db UNCHANGED`);

  // ── cross-tab convergence: applyOp('breakdown') on a peer db == direct call (byte-identical) ──
  const dbA = seed(SQL), dbB = seed(SQL);
  SA.breakdownByAttribute(dbA, 'SCH_AUTHORED', 'TASK_Architecture', 'storey');
  Sync.applyOp(dbB, { op: 'breakdown', schedId: 'SCH_AUTHORED', taskId: 'TASK_Architecture', attr: 'storey' });
  ok(dump(dbA) === dump(dbB), `applyOp('breakdown') converges peer db byte-identical to the direct verb`);
  const dbC = seed(SQL);
  Sync.applyOp(dbC, { op: 'addtask', schedId: 'SCH_AUTHORED', taskId: 'TASK_Fit_out', name: 'Fit-out', wbsParent: 'TASK_Architecture' });
  ok(dbC.exec("SELECT 1 FROM tasks WHERE task_id='TASK_Fit_out'")[0].values.length === 1, `applyOp('addtask') replays with the explicit id`);

  console.log(`§WBS-SUMMARY ${pass}/${pass + fail} pass`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.log('FATAL ' + e.stack); process.exit(1); });
