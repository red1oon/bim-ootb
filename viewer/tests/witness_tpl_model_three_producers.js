#!/usr/bin/env node
// WITNESS — §TPL_MODEL_THIRD_PRODUCER: every generator that writes the SCH_AUTHORED task grid names
// itself, and the three names are distinct.
// Spec: bim-compiler prompts/4D_MODEL_INTEGRITY.md §I.5g · prompts/4D_GANTT_TM_REFACTOR.md §FUTURE
// item 7 Stage 5 / §STAGE45_PLAN (queue item B-2).
//
// WHICH LAYER THIS PROVES (WITNESS_INTERFACE_FRAMEWORK.md §CRISIS LESSON 1): the ATTRIBUTION LINE
// ONLY — which construct produced the persisted task grid. It says nothing about the grid's
// contents, the drawn bars, kernel_ops, or the movie. Its whole subject is that the §TPL_MODEL row
// of the §I ownership table can be answered from the log instead of guessed.
//
// ISSUE THIS PROVES OR DISPROVES (§I.5g). The §I row presents a TWO-way fork — `model=template`
// (canonical) or `model=legacy-deriveZones` (dead). There are THREE generators, all writing the
// same `SCH_AUTHORED` schedule id, and the third emitted no attribution line at all:
//
//   schedule_author.js instantiateTemplate  (materializeZones + opts.template)  §TPL_MODEL model=template
//   ScheduleGate.deriveZones                (materializeZones, no template)     §TPL_MODEL model=legacy-deriveZones
//   schedule_author.js materializeDefault   (LIVE UI: schedule_author_ui.js     ⛔ NOTHING, before this witness
//                                            generateDraft() :276 blank box,
//                                            :293 the !ok fallback)
//
// So a reader of §TPL_MODEL could see the line ABSENT and had no way to distinguish "the third
// producer ran" from "no producer ran" — a schedule from neither model was a state the log could
// not express. `witness_gantt_edit_coherence.js:210-218` correctly reports INCONCLUSIVE on an
// absent line (PRIMAL LAW clause 4 done right, and the reason the gap was detectable at all); this
// witness is what makes that third state ATTRIBUTABLE rather than merely acknowledged.
//
// HOW IT JUDGES: every producer is RUN for real against a shipped building DB and its own SHIPPED
// §TPL_MODEL line is READ off the log. Nothing is re-derived from "we passed template:" — that is
// the §I row's own named `never`. Both console streams are TEE'd, never muted (§I.5j(b): the dead
// branch's line used to be emitted on console.warn and deleted by the collector before any witness
// saw it — a §-tag was not enough, the STREAM decided visibility).
//
// Command: node viewer/tests/witness_tpl_model_three_producers.js [Building]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const HOME = require('os').homedir();
const initSqlJs = require(path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const SQLJS_DIST = path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js', 'dist');
const VIEWER_DIR = process.env.VIEWER_DIR || path.join(__dirname, '..');
const ScheduleGate = require(path.join(VIEWER_DIR, 'schedule_gate.js'));
global.ScheduleGate = ScheduleGate;
// §I.5c — without this the layer pass silently no-ops. Not this witness's subject, but a run in
// which a shipped pass did not execute is not the run anyone else is judging.
global.SupportSweep = require(path.join(VIEWER_DIR, 'support_sweep.js'));
const ScheduleAuthor = require(path.join(VIEWER_DIR, 'schedule_author.js'));
const KIT = path.join(__dirname, '..', '..', 'witness_kit');
const { Witness } = require(path.join(KIT, 'contract'));

const BLD_DIR = process.env.BLD_DIR || path.join(HOME, 'bim-ootb', 'buildings');
const BLD = process.argv[2] || 'Duplex';
const START = '2026-01-01';

// The EXECUTED table, whole-file — slicing rates.js drops SEQUENCE_NAME_OVERRIDES and SHIFT_HOURS.
function executedRules() {
  const sb = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(VIEWER_DIR, 'rates.js'), 'utf8'), sb);
  return sb;
}
const T = JSON.parse(fs.readFileSync(path.join(VIEWER_DIR, 'rates', '4D_template.json'), 'utf8'));

// TEE both streams; collect only §TPL_MODEL. Never mute — §I.5j(b).
function withLogs(fn) {
  const _l = console.log, _w = console.warn, seen = [];
  const keep = s => { if (s.indexOf('§TPL_MODEL') === 0) seen.push(s); };
  console.log = (...a) => { keep(a.join(' ')); return _l.apply(console, a); };
  console.warn = (...a) => { keep(a.join(' ')); return _w.apply(console, a); };
  try { return { out: fn(), lines: seen }; } finally { console.log = _l; console.warn = _w; }
}
const modelIdOf = lines => {
  const m = /§TPL_MODEL\s+model=([A-Za-z0-9_-]+)/.exec(lines[lines.length - 1] || '');
  return m ? m[1] : '';
};
const taskCount = db => {
  const r = db.exec("SELECT COUNT(*) FROM tasks WHERE schedule_id='SCH_AUTHORED'");
  return r.length ? r[0].values[0][0] : 0;
};
// §TPL3P_GRIDHASH — the persisted grid itself, so "this change only adds a log line" is a MEASURED
// claim and not an assertion about the diff. Run the witness with VIEWER_DIR pointed at the
// unmodified tree and the hashes must be byte-identical to this tree's.
function gridHash(db) {
  const q = s2 => { const r = db.exec(s2); return r.length ? r[0].values : []; };
  const t = q("SELECT task_id,name,schedule_start,schedule_finish,is_summary,wbs_parent,resource FROM tasks WHERE schedule_id='SCH_AUTHORED' ORDER BY task_id");
  const te = q("SELECT task_id,guid FROM task_elements ORDER BY task_id,guid");
  const sq = q("SELECT predecessor_id,successor_id,sequence_type,lag_days FROM task_sequences ORDER BY predecessor_id,successor_id");
  return require('crypto').createHash('sha1')
    .update(JSON.stringify(t)).update(JSON.stringify(te)).update(JSON.stringify(sq))
    .digest('hex').slice(0, 16);
}

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) });
  const R = executedRules();
  const file = path.join(BLD_DIR, BLD + '_extracted.db');
  if (!fs.existsSync(file)) {
    console.log('§TPL3P INCONCLUSIVE — no DB at ' + file + '. Nothing was judged; this is not a PASS.');
    process.exitCode = 1; return;
  }
  const bytes = new Uint8Array(fs.readFileSync(file));
  const rows = [];

  // Each producer gets a FRESH database — all three write the same schedule id, so sharing one
  // would make each run judge the previous one's rows.
  function run(producer, fn) {
    const db = new SQL.Database(bytes.slice());
    const r = withLogs(() => fn(db));
    const n = taskCount(db), h = gridHash(db);
    db.close();
    rows.push({ producer: producer, model: modelIdOf(r.lines), lineCount: r.lines.length,
      line: (r.lines[r.lines.length - 1] || '').slice(0, 120), tasks: n, gridHash: h });
  }
  const zoneOpts = extra => Object.assign({
    start: START, laborRates: R.LABOR_RATES, rates: R.RATES,
    nameOverrides: R.SEQUENCE_NAME_OVERRIDES, defaultRule: R.SEQUENCE_DEFAULT,
    scheduleGate: ScheduleGate, shiftHours: T.calendar.hours_per_shift }, extra || {});

  run('materializeZones+template', db => ScheduleAuthor.materializeZones(db, R.SEQUENCE_RULES, zoneOpts({ template: T })));
  run('materializeZones-noTemplate', db => ScheduleAuthor.materializeZones(db, R.SEQUENCE_RULES, zoneOpts()));
  // The two LIVE call sites of the third producer, schedule_author_ui.js generateDraft() :276/:293.
  run('materializeDefault-blank', db => ScheduleAuthor.materializeDefault(db, R.SEQUENCE_RULES,
    { start: START, laborRates: R.LABOR_RATES, rates: R.RATES,
      nameOverrides: R.SEQUENCE_NAME_OVERRIDES, defaultRule: R.SEQUENCE_DEFAULT, blank: true }));
  run('materializeDefault-dated', db => ScheduleAuthor.materializeDefault(db, R.SEQUENCE_RULES,
    { start: START, laborRates: R.LABOR_RATES, rates: R.RATES,
      nameOverrides: R.SEQUENCE_NAME_OVERRIDES, defaultRule: R.SEQUENCE_DEFAULT, blank: false }));

  rows.forEach(r => console.log('§TPL3P_ROW ' + BLD.padEnd(10) + r.producer.padEnd(30) +
    ' model=' + (r.model || '<NONE>').padEnd(22) + ' lines=' + r.lineCount + ' tasks=' + r.tasks +
    ' gridHash=' + r.gridHash));

  Witness('TPL_MODEL_THREE_PRODUCERS')
    .population(() => rows)
    .schema({
      type: 'object',
      required: ['producer', 'model', 'lineCount', 'tasks', 'gridHash'],
      properties: {
        producer: { type: 'string', minLength: 1 },
        // The enum IS the claim: three named models, and nothing else. An unnamed producer yields
        // '' and fails here — which is exactly the pre-fix state of materializeDefault.
        model: { type: 'string', enum: ['template', 'legacy-deriveZones', 'default-materialize'] },
        lineCount: { type: 'integer', minimum: 1 },
        tasks: { type: 'integer', minimum: 1 },
        gridHash: { type: 'string', minLength: 16 }
      }
    })
    // W-TPL3P-1 — the third producer names ITSELF, not one of the other two. Without this a fix
    // that made materializeDefault print `model=template` would satisfy the schema and be wrong.
    .invariant('W-TPL3P-1 every materializeDefault run reports model=default-materialize',
      rs => rs.filter(r => r.producer.indexOf('materializeDefault') === 0)
        .every(r => r.model === 'default-materialize'))
    // W-TPL3P-2 — all three ids are actually distinct, i.e. the log can TELL them apart. This is
    // the §I.5g claim proper: the row's two-way fork has a third state and it is expressible.
    // ⚠ SCOPE-BLINDNESS FOUND AND CLOSED WHILE WRITING THIS (PRIMAL LAW clause 4). The first form
    // was `new Set(...).size === 3`, and it PASSED on unmodified origin/main — because the missing
    // line yields '' and '' is a third distinct string. Set EQUALITY against the three named ids is
    // what actually judges the claim; measured, this invariant now goes red on main and green here.
    .invariant('W-TPL3P-2 the three observed ids are exactly {template, legacy-deriveZones, default-materialize}',
      rs => {
        const got = Array.from(new Set(rs.map(r => r.model))).sort().join('|');
        return got === 'default-materialize|legacy-deriveZones|template';
      })
    // W-TPL3P-3 — exactly one attribution line per production. Two lines would mean a producer
    // fell through into another, which is a worse defect than none at all.
    .invariant('W-TPL3P-3 exactly one §TPL_MODEL line per producer run', rs => rs.every(r => r.lineCount === 1))
    // W-TPL3P-4 — every run actually WROTE a grid, so no row is a verdict about an empty database.
    .invariant('W-TPL3P-4 every producer persisted a non-empty task grid', rs => rs.every(r => r.tasks > 0))
    // RED CONTROL — the pre-fix state, reproduced: strip the third producer's attribution. If the
    // witness still passes, it is not judging the line it claims to judge.
    .redControl(rs => rs.map(r => r.producer.indexOf('materializeDefault') === 0
      ? Object.assign({}, r, { model: '', lineCount: 0 }) : r))
    .run();
})();
