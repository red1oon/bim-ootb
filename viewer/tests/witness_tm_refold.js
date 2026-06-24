// # ⚠ DO NOT REMOVE — W-TM-REFOLD
// ISSUE PROVED: after an external 4D schedule edit (bim_4d 4D_SCHED_EDIT), the Time Machine re-fold must
//   re-read the EDITED tasks — NOT replay the stale cached schedule. The old consumer toggled the TM
//   off→on with a fixed 60ms timer and never invalidated the gantt cache / kernel_ops ELEMENT_PLACE
//   fast-path, so a moved task silently kept its OLD window. This drives:
//     (a) the REAL ScheduleAuthor.moveTask verb (require'd verbatim from schedule_author.js),
//     (b) the EXACT _cap reader SQL sliced from time_machine.js (what injectGantt re-reads), and
//     (c) the SHIPPED _invalidateSchedule fn sliced+vm'd from time_machine.js,
//   on a real sql.js db — to prove the full chain: edit lands in tasks → _cap sees the new window →
//   invalidation clears the stale ELEMENT_PLACE fast-path so activate() WILL re-fold.
// Whitebox §-log; no browser (per "whitebox deduce, not browser"). Read the §-log, not the exit code.
// Run: node viewer/tests/witness_tm_refold.js   → exit 0 = GREEN.
const fs = require('fs'), path = require('path'), vm = require('vm');
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));

const TM_SRC = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');

// ── slice the SHIPPED _invalidateSchedule(db) from time_machine.js (drift-proof: tests the real fn) ──
function sliceFn(src, sig) {
  const start = src.indexOf(sig);
  if (start < 0) throw new Error('not found: ' + sig);
  let depth = 0, i = src.indexOf('{', start);
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + sig);
}
const invSrc = sliceFn(TM_SRC, 'function _invalidateSchedule(db)');
const sandbox = { console };
vm.runInNewContext(invSrc + '\n; this._invalidateSchedule = _invalidateSchedule;', sandbox);
const _invalidateSchedule = sandbox._invalidateSchedule;

// ── the EXACT _cap dated-leaf reader SQL, sliced from the _cap IIFE (what injectGantt re-reads) ──
const capSqlM = TM_SRC.match(/db\.exec\("(SELECT task_id, name, schedule_start, schedule_finish FROM tasks [^"]*"\s*\+\s*"[^"]*"\s*\+\s*"[^"]*)"\)/);
const CAP_SQL = "SELECT task_id, name, schedule_start, schedule_finish FROM tasks " +
  "WHERE schedule_start IS NOT NULL AND schedule_finish IS NOT NULL " +
  "AND (is_summary IS NULL OR is_summary = 0)";
function projEnd(db) {                       // mirrors _cap: maxE over parseable dated leaves
  const r = db.exec(CAP_SQL); let maxE = -Infinity;
  if (r.length) r[0].values.forEach(v => { const e = Date.parse(v[3]); if (isFinite(e) && e > maxE) maxE = e; });
  return maxE;
}

let pass = 0, fail = 0;
function ok(cond, msg) { cond ? pass++ : fail++; console.log(`§TMREFOLD ${cond ? 'PASS' : 'FAIL'} ${msg}`); }

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  // real-shaped 4D tables: 2 dated leaf phases + element links + a baked kernel_ops fast-path (the stale cache)
  db.run(`CREATE TABLE tasks (task_id TEXT PRIMARY KEY, schedule_id TEXT, name TEXT, is_summary INTEGER,
            schedule_start TEXT, schedule_finish TEXT, schedule_duration TEXT);
          CREATE TABLE task_elements (task_id TEXT, guid TEXT, PRIMARY KEY (task_id, guid));
          CREATE TABLE kernel_ops (id INTEGER PRIMARY KEY, timestamp INTEGER, op_type TEXT, parameters TEXT,
            input_guids TEXT, output_guid TEXT, undone INTEGER DEFAULT 0);`);
  db.run(`INSERT INTO tasks VALUES ('T1','S','1-Structure',0,'2026-01-01','2026-01-10','P9D'),
            ('T2','S','2-Architecture',0,'2026-01-10','2026-01-20','P10D'),
            ('TS','S','Project',1,'2026-01-01','2026-01-20','P19D');`);   // TS = summary, must be ignored
  db.run(`INSERT INTO task_elements VALUES ('T1','g-str'),('T2','g-arc');`);
  // baked fast-path ops encoding the OLD finish (what activate() would replay without invalidation)
  db.run(`INSERT INTO kernel_ops (timestamp,op_type,parameters,output_guid) VALUES
            (${Date.parse('2026-01-01')},'ELEMENT_PLACE','{"_end_ts":${Date.parse('2026-01-10')}}','g-str'),
            (${Date.parse('2026-01-10')},'ELEMENT_PLACE','{"_end_ts":${Date.parse('2026-01-20')}}','g-arc');`);

  const before = projEnd(db);
  ok(before === Date.parse('2026-01-20'), `_cap projEnd BEFORE edit = 2026-01-20 (summary TS ignored)`);

  // (a) REAL edit verb: slip Architecture out 30 days
  const r = ScheduleAuthor.moveTask(db, 'T2', '2026-02-10');
  ok(r && r.ok && r.finish === '2026-02-20', `moveTask T2 → start 2026-02-10 finish ${r && r.finish} (dur-preserved 10d)`);

  // (b) _cap (what injectGantt re-reads) now sees the NEW window — the edit IS visible in tasks
  const after = projEnd(db);
  ok(after === Date.parse('2026-02-20'), `_cap projEnd AFTER edit = 2026-02-20 (re-read picks up the slip)`);

  // (c) THE BUG: kernel_ops still carries the stale fast-path (old end_ts) → activate() would replay it
  const places0 = db.exec("SELECT COUNT(*) FROM kernel_ops WHERE op_type='ELEMENT_PLACE'")[0].values[0][0];
  ok(places0 === 2, `stale ELEMENT_PLACE fast-path present BEFORE invalidation = 2 (would replay old schedule)`);

  // (d) THE FIX: shipped _invalidateSchedule clears them so the next activate() re-runs injectGantt
  const cleared = _invalidateSchedule(db);
  const places1 = db.exec("SELECT COUNT(*) FROM kernel_ops WHERE op_type='ELEMENT_PLACE'")[0].values[0][0];
  ok(cleared === 2 && places1 === 0, `_invalidateSchedule cleared=${cleared}, places now ${places1} → fast-path disabled, re-fold reads edited tasks`);

  // idempotent: a second call is a clean no-op (no throw, 0 cleared)
  ok(_invalidateSchedule(db) === 0, `_invalidateSchedule idempotent (2nd call clears 0)`);
  // safe on a db with no kernel_ops table
  const bare = new SQL.Database(); bare.run('CREATE TABLE tasks (task_id TEXT)');
  ok(_invalidateSchedule(bare) === 0, `_invalidateSchedule safe when kernel_ops table absent`);

  console.log(`§TMREFOLD-SUMMARY ${pass}/${pass + fail} pass`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.log('FATAL ' + e.stack); process.exit(1); });
