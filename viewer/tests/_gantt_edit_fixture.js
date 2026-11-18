// _gantt_edit_fixture.js — one owner for "a real building with an authored schedule, its element ops, and the SHIPPED
// Gantt edit verbs in a vm context" (bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.19.7, §Q.19.9). Used by
// witness_gantt_one_commit_pipeline.js and witness_gantt_undo_every_edit.js so the two cannot drift apart.
// Nothing here re-types an edit: the verbs are sliced from the time_machine family by brace matching; the refresh
// steps are instrumented stubs that record their names (resync also re-sorts the ops, as the real one does).
'use strict';
const __readSrc = require('./_split_families.js').readSource;
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os'), crypto = require('crypto');
const V = path.join(__dirname, '..'), ROOT = path.join(V, '..');
const tmSrc = __readSrc(path.join(V, 'time_machine.js'), 'utf8');
// every line-anchored function of the family: name -> body (brace matched; first definition wins)
function functions(src) {
  const out = {}, re = /^[ \t]*function (\w+)\(/gm; let m;
  while ((m = re.exec(src))) {
    const idx = m.index + m[0].indexOf('function'); let d = 0, open = false;
    for (let i = idx; i < src.length; i++) {
      if (src[i] === '{') { d++; open = true; }
      else if (src[i] === '}') { d--; if (open && d === 0) { if (!out[m[1]]) out[m[1]] = src.slice(idx, i + 1); break; } }
    }
  }
  return out;
}
const FN = functions(tmSrc);
const stripComments = s => s.replace(/\/\/[^\n]*/g, '');
const sha = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const BASE_NAMES = ['_retimeSpan', 'retimeTaskElements', '_tmBusyRecording', '_tmEditLocked', '_tmEditExceptionRecover',
  'commitGanttDrag', 'shiftGanttSchedule', 'commitGanttGroupShift', 'rescheduleGanttAsap', 'linkGanttBars', 'undoLastGanttEdit'];
const OPTIONAL = ['_tmCommitEdit', '_tmEditRefresh', '_tmEditSnapshot'];   // sliced when the revision has them
// the lock gate (🔓→🔒): verifyGanttIntegrity and what it calls, as witness_gantt_lock_integrity.js slices them
const LOCK_GATE = ['_promoteRoofLoadPath', '_zoneIndexBuild', '_zoneIndex', '_classifyNameOverride', '_classifyRule', '_scheduledWhere', '_civilRule',
  '_contactGraph', '_designatedSupport', '_midairAudit', '_buildXrayElements', 'verifyGanttIntegrity', 'captureLockBaseline'];

// playedChain(bld) — THE building as the viewer holds it after a 4D generate: the db the viewer loads (meta or extracted,
// scripts/cache_4d_run.js resolveDbFile), the authored schedule from the shipped materializeZones with the real rate
// tables and template, and kernel_ops carrying the PLAYED layer (scripts/lib/tm_played_layer.js mirrorInjectGantt — the
// instants the Time Machine reveals). The same chain scripts/cache_4d_run.js build() runs; the pipeline's §-log is left on.
// -> { db, SQL, SA, GM, RULES, schedId, gcv, rawEls, play, dbFile } or { missing } / { failed }
async function playedChain(bld) {
  const CACHE = require(path.join(ROOT, 'scripts', 'cache_4d_run.js'));
  const dbf = CACHE.resolveDbFile(bld);
  if (!dbf.path) return { missing: bld + ': ' + dbf.reason };
  const SG = require(path.join(V, 'schedule_gate.js')); global.ScheduleGate = SG;
  const SA = require(path.join(V, 'schedule_author.js'));
  const SS = require(path.join(V, 'support_sweep.js')); global.SupportSweep = SS;
  const CP = require(path.join(V, 'cpm_schedule.js')); global.CpmSchedule = CP;
  const GM = require(path.join(V, 'gantt_model.js')); global.GanttModel = GM;
  globalThis.RoomWalker = require(path.join(V, 'lib', 'room_walker.js'));
  globalThis.LevelDeriver = require(path.join(V, 'lib', 'level_deriver.js'));
  globalThis.LocationAxis = require(path.join(V, 'location_axis.js'));
  const TMP = require(path.join(ROOT, 'scripts', 'lib', 'tm_played_layer.js'));
  const T = JSON.parse(__readSrc(path.join(V, 'rates', '4D_template.json'), 'utf8'));
  const rsb = { console: { log() {}, warn() {}, error() {} } }; vm.createContext(rsb); vm.runInContext(__readSrc(path.join(V, 'rates.js'), 'utf8'), rsb);
  const gcv = +((/var _GANTT_CACHE_VERSION = (\d+);/.exec(tmSrc) || [])[1] || 0);
  const initSqlJs = require(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.js'));
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.wasm')) });
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbf.path)));
  const tmsb = TMP.buildSandbox({ tmSrc: tmSrc, SA: SA, SG: SG, CP: CP, GM: GM, SS: SS, LABOR_RATES: rsb.LABOR_RATES, console: console });
  const base = { start: CACHE.PROJECT_START, laborRates: rsb.LABOR_RATES, rates: rsb.RATES, nameOverrides: rsb.SEQUENCE_NAME_OVERRIDES,
    defaultRule: rsb.SEQUENCE_DEFAULT, scheduleGate: SG, shiftHours: T.calendar.hours_per_shift, template: T, db: db,
    displayRemap: tmsb._tmDisplayRemap, genVersion: gcv };
  const rawEls = SA._buildScheduleElements(db, rsb.SEQUENCE_RULES, base);
  globalThis.APP = { db: db };
  const res = SA.materializeZones(db, rsb.SEQUENCE_RULES, base);
  delete globalThis.APP;
  if (!res || !res.ok || !res.tasks) return { failed: 'materializeZones: ' + JSON.stringify(res).slice(0, 120) };
  const tasks = res.tasks.map(t => ({ id: t.id, sDays: t.sDays, eDays: t.eDays, phase: t.phase, storey: t.storey, guids: t.guids }));
  const mp = TMP.mirrorInjectGantt({ sb: tmsb, elements: rawEls, tasks: tasks, db: db, startISO: base.start, applyTiling: true, log: console.log });
  if (!mp.ok) return { failed: 'no played layer: ' + mp.reason };
  db.run('CREATE TABLE IF NOT EXISTS kernel_ops (id INTEGER PRIMARY KEY, timestamp INTEGER NOT NULL, op_type TEXT NOT NULL, parameters TEXT NOT NULL, input_guids TEXT, output_guid TEXT, undone INTEGER DEFAULT 0)');
  db.run("DELETE FROM kernel_ops WHERE op_type='ELEMENT_PLACE'");
  const ins = db.prepare('INSERT INTO kernel_ops (timestamp,op_type,parameters,input_guids,output_guid,undone) VALUES(?,?,?,?,?,0)');
  db.run('BEGIN');
  rawEls.forEach(e => { const p = mp.play[e.guid]; if (!p) return;
    ins.run([p.s, 'ELEMENT_PLACE', JSON.stringify({ _end_ts: p.e, storey: e.storey, phase: e.phase, cls: e.cls, name: e.name || '' }), '[]', e.guid]); });
  db.run('COMMIT'); ins.free();
  return { db: db, SQL: SQL, SA: SA, GM: GM, SG: SG, RULES: rsb.SEQUENCE_RULES, rulesAll: rsb, schedId: res.scheduleId, gcv: gcv, rawEls: rawEls, play: mp.play, dbFile: path.basename(dbf.path) };
}

// make({ bld, extraNames, document, sandbox, lockGate, layer }) -> the fixture
//   layer 'played' (default; env FX_LAYER) = playedChain above. 'spread' = the old small fixture: *_extracted.db, empty
//   rate tables, each task's elements laid end to end across its window (fast; not what the viewer plays)., or { missing: path } when the building db is absent
async function make(o) {
  o = o || {};
  const bld = o.bld || 'Duplex';
  const layer = o.layer || process.env.FX_LAYER || 'played';
  if (layer !== 'played' && layer !== 'spread') throw new Error('unknown layer "' + layer + '" — played | spread');
  let PC = null;
  if (layer === 'played') { PC = await playedChain(bld); if (PC.missing || PC.failed) return PC; }
  const dbPath = path.join(process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings'), bld + '_extracted.db');
  if (!PC && !fs.existsSync(dbPath)) return { missing: dbPath };
  const SG = require(path.join(V, 'schedule_gate.js')); global.ScheduleGate = SG;
  const SA = require(path.join(V, 'schedule_author.js'));
  global.SupportSweep = require(path.join(V, 'support_sweep.js')); global.CpmSchedule = require(path.join(V, 'cpm_schedule.js'));
  const GM = require(path.join(V, 'gantt_model.js'));
  const initSqlJs = require(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.js'));
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.wasm')) });
  const db = PC ? PC.db : new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
  const rulesJson = JSON.parse(__readSrc(path.join(V, 'rates', 'sequence_rules.json'), 'utf8')), RULES = rulesJson.SEQUENCE_RULES || rulesJson;
  const TPL = JSON.parse(__readSrc(path.join(V, 'rates', '4D_template.json'), 'utf8'));
  const mres = PC ? { ok: true, scheduleId: PC.schedId } : SA.materializeZones(db, RULES, { start: '2026-01-01', laborRates: {}, rates: {}, scheduleGate: SG, template: TPL });
  if (!mres || !mres.ok) return { failed: 'materializeZones: ' + JSON.stringify(mres).slice(0, 120) };
  const schedId = mres.scheduleId;
  const q = (sql, p) => { const r = db.exec(sql, p); return r.length ? r[0].values : []; };
  const ops = [];
  if (PC) {   // the played layer, read back from kernel_ops in loadOps' own shape and order
    q("SELECT id, timestamp, op_type, parameters, output_guid FROM kernel_ops WHERE op_type='ELEMENT_PLACE' AND undone=0 ORDER BY timestamp").forEach(r => {
      const p = JSON.parse(r[3]); ops.push({ id: r[0], start_ts: r[1], end_ts: p._end_ts || (r[1] + 60000), op_type: r[2], parameters: p, input_guids: [], output_guid: r[4] }); });
  } else {
  // ops in loadOps' shape, each task's elements laid end to end across its own window
  db.run('CREATE TABLE IF NOT EXISTS kernel_ops (id INTEGER PRIMARY KEY, timestamp INTEGER NOT NULL, op_type TEXT NOT NULL, parameters TEXT NOT NULL, input_guids TEXT, output_guid TEXT, undone INTEGER DEFAULT 0)');
  db.run("DELETE FROM kernel_ops WHERE op_type='ELEMENT_PLACE'");
  const win = {}; q("SELECT task_id, name, schedule_start, schedule_finish FROM tasks WHERE schedule_id=? AND (is_summary IS NULL OR is_summary=0)", [schedId])
    .forEach(r => { win[r[0]] = { s: Date.parse(r[2] + 'T00:00:00Z'), e: Date.parse(r[3] + 'T00:00:00Z') }; });
  const byTask = {}; q('SELECT task_id, guid FROM task_elements ORDER BY task_id, guid').forEach(r => { (byTask[r[0]] = byTask[r[0]] || []).push(r[1]); });
  const ins = db.prepare('INSERT INTO kernel_ops (timestamp,op_type,parameters,input_guids,output_guid,undone) VALUES(?,?,?,?,?,0)');
  db.run('BEGIN');
  Object.keys(byTask).sort().forEach(tid => { const w = win[tid]; if (!w) return; const gs = byTask[tid], step = (w.e - w.s) / gs.length;
    gs.forEach((g, k) => { const s = Math.round(w.s + k * step), e = Math.round(w.s + (k + 1) * step), p = { _end_ts: e, storey: 'L', phase: 'Architecture' };
      ins.run([s, 'ELEMENT_PLACE', JSON.stringify(p), '[]', g]); ops.push({ id: ops.length + 1, start_ts: s, end_ts: e, op_type: 'ELEMENT_PLACE', parameters: p, input_guids: [], output_guid: g }); }); });
  db.run('COMMIT'); ins.free();
  ops.sort((a, b) => a.start_ts - b.start_ts);
  }

  const steps = [], logs = [];
  const sb = Object.assign({
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')) }, JSON: JSON,
    document: o.document || { getElementById: id => (id === 'tm-gantt-tip' ? { style: {}, textContent: '' } : null) },
    window: { ScheduleAuthor: SA, performance: null }, A: () => ({ db: db }),
    _ops: ops, _ganttTasks: [], _taskIndex: { scheduleId: schedId }, _lastEdit: null, _cursor: 0, _ganttCritical: {}, __steps: steps,
  }, o.sandbox || {});
  sb.window.window = sb.window; vm.createContext(sb);
  if (o.lockGate) {
    sb.performance = { now: () => Date.now() }; sb.URLSearchParams = URLSearchParams;
    sb.ZoneIndex = require(path.join(V, 'zone_index.js')); sb.ScheduleGate = SG; sb.SupportSweep = global.SupportSweep; sb.CpmSchedule = global.CpmSchedule;
    sb.window.SEQUENCE_RULES = rulesJson.SEQUENCE_RULES; sb.window.SEQUENCE_DEFAULT = rulesJson.SEQUENCE_DEFAULT;
    sb.window.SEQUENCE_NAME_OVERRIDES = rulesJson.SEQUENCE_NAME_OVERRIDES || rulesJson.NAME_OVERRIDES || [];
    sb._zoneMemo = []; sb._lockBaseline = null;
  }
  const names = BASE_NAMES.concat(o.extraNames || []).concat(OPTIONAL.filter(n => !!FN[n])).concat(o.lockGate ? LOCK_GATE.filter(n => !!FN[n]) : []);
  names.forEach(n => { if (!FN[n]) throw new Error(n + ' not found in the time_machine family'); });
  vm.runInContext(names.map(n => FN[n]).join('\n') + [
    'function _tmResyncAfterRetime() { __steps.push("resync"); _ops.sort(function (a, b) { return a.start_ts - b.start_ts; }); }',
    'function _tmAnnotateCpm() { __steps.push("annotate"); } function _tmPersistEdit() { __steps.push("persist"); }',
    'function invalidateGanttModel() { __steps.push("invalidate"); } function computeDays() { __steps.push("computeDays"); }',
    'function drawGanttMini() { __steps.push("draw"); } function renderAtTime() { __steps.push("render"); }',
    'function _tmSay() {} function _tmSayException() {} function setTimeout() {}',
    'this.__v = { drag: commitGanttDrag, shift: shiftGanttSchedule, group: commitGanttGroupShift, asap: rescheduleGanttAsap, link: linkGanttBars, undo: undoLastGanttEdit' +
      (o.extraNames && o.extraNames.indexOf('openGanttProps') >= 0 ? ', props: openGanttProps' : '') + ' };',
    'this.__lastEdit = function () { return _lastEdit; };',
    o.lockGate ? 'this.__gate = { capture: captureLockBaseline, verify: verifyGanttIntegrity };' : '',
  ].join('\n'), sb);
  (o.extraNames || []).forEach(n => { sb.__v[n] = vm.runInContext(n, sb); });   // every extra verb is reachable by its own name

  function rebuildBars() {
    const idx = { ok: true, scheduleId: schedId, tasks: {}, guidTask: {} };
    q("SELECT task_id, name, schedule_start, schedule_finish FROM tasks WHERE schedule_id=? AND (is_summary IS NULL OR is_summary=0)", [schedId])
      .forEach(r => { idx.tasks[r[0]] = { id: r[0], name: r[1], start: r[2], finish: r[3] }; });
    q('SELECT te.guid, te.task_id FROM task_elements te JOIN tasks t ON t.task_id = te.task_id WHERE t.schedule_id=?', [schedId]).forEach(r => { idx.guidTask[r[0]] = r[1]; });
    sb._ganttTasks = GM.buildTasks(sb._ops, idx, RULES).tasks;
    return sb._ganttTasks.filter(b => b.taskId && b.guids && b.guids.length).sort((a, b) => a.startTs - b.startTs || (a.taskId < b.taskId ? -1 : 1));
  }
  // the four things an edit can change, each as a short hash (tasks = EVERY row of the schedule, summary rows included)
  function parts() {
    return { tasks: sha(JSON.stringify(q('SELECT task_id, schedule_start, schedule_finish, schedule_duration FROM tasks WHERE schedule_id=? ORDER BY task_id', [schedId]))),
      opsDb: sha(JSON.stringify(q("SELECT output_guid, timestamp, parameters FROM kernel_ops WHERE op_type='ELEMENT_PLACE' ORDER BY output_guid"))),
      opsMem: sha(JSON.stringify(sb._ops.map(op => [op.output_guid, op.start_ts, op.end_ts]).sort())),
      links: sha(JSON.stringify(q('SELECT predecessor_id, successor_id, sequence_type, lag_days FROM task_sequences ORDER BY 1, 2'))) };
  }
  return { bld: bld, layer: layer, dbFile: PC ? PC.dbFile : path.basename(dbPath), db: db, SA: SA, GM: GM, RULES: RULES, schedId: schedId, sb: sb, logs: logs, steps: steps, q: q, ops: ops,
    rebuildBars: rebuildBars, parts: parts };
}
module.exports = { make: make, playedChain: playedChain, functions: functions, FN: FN, tmSrc: tmSrc, stripComments: stripComments, sha: sha, V: V, ROOT: ROOT };
